'use server'

/**
 * generateSessionAction — AI session generation Server Action (D-08, D-09).
 *
 * Security contract:
 *   - userId is ALWAYS read from the iron-session cookie; never from client input.
 *   - ANTHROPIC_API_KEY is imported from @/env (server-only module, no NEXT_PUBLIC_ prefix).
 *   - AI output is validated through BOTH gates (Zod schema + safety gate) BEFORE any DB write.
 *   - Rate limit is enforced BEFORE the Anthropic API call — blocked requests never incur spend.
 *   - rawJson is stored server-only for debugging; never returned to the client.
 *   - Generic error messages only — Zod issues / safety reason are logged server-side.
 *
 * Execution order (D-09):
 *   1. Auth: read userId from iron-session; return error if unauthenticated
 *   2. Profile: read user profile from DB
 *   3. Rate limit: check generationLimiter BEFORE Anthropic call
 *   4. AI call: Anthropic messages.create with cache-controlled system prompt
 *   5. Zod: validate parsed JSON against GeneratedSessionSchema
 *   6. Safety gate: validateSessionSafety on Zod-validated output
 *   7. DB write: computeWattTargets then db.insert(trainingSessions).returning()
 *   8. Return: { data: inserted }
 *
 * NOTE on redirect vs. error return (architectural deviation documented in plan):
 *   D-09 says "redirect if unauthenticated" but this action is called imperatively
 *   via useTransition, not as a page-level navigation. Returning { error } is the
 *   correct equivalent here — the page-level auth gate (proxy.ts + auth layout)
 *   already enforces the redirect intent before this action is reachable.
 *
 * NOTE on revalidatePath:
 *   revalidatePath is intentionally NOT called here. Calling it inside a Server Action
 *   wrapped in startTransition triggers the Next.js 15+ isPending hang bug (RESEARCH
 *   Pattern 6). The UI renders from the returned data instead.
 */

import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import Anthropic from '@anthropic-ai/sdk'

import { sessionOptions, type SessionData } from '@/lib/session'
import { db } from '@/lib/db/index'
import { trainingSessions } from '@/lib/db/schema'
import { findUserProfileByUserId } from '@/lib/db/queries'
import { GeneratedSessionSchema } from '@/lib/db/schemas/session'
import { validateSessionSafety } from '@/lib/safety-gate'
import { generationLimiter } from '@/lib/ratelimit'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/ai/prompt'
import { computeWattTargets } from '@/lib/ai/compute-watts'
import { ANTHROPIC_API_KEY } from '@/env'

export async function generateSessionAction(
  readinessScore: number
): Promise<{ data?: typeof trainingSessions.$inferSelect; error?: string }> {

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  const ironSession = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!ironSession.id) {
    return { error: 'Not authenticated' }
  }
  const userId = ironSession.id

  // ── Step 2: Profile ───────────────────────────────────────────────────────
  const profile = await findUserProfileByUserId(userId)

  // ── Step 3: Rate limit (BEFORE AI call — never waste spend on blocked users) ──
  const limitResult = await generationLimiter.limit(userId)
  if (!limitResult.success) {
    return { error: 'Daily limit reached. Try again tomorrow.' }
  }

  // ── Step 4: Anthropic API call ────────────────────────────────────────────
  let rawText: string
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // cache_control: array form is required for prompt caching (RESEARCH Pattern 1).
          // String form silently drops cache_control. System prompt must be ≥1024 tokens.
          // ttl:"1h" resolved in RESEARCH open question #1: 1h TTL for single-owner deployment
          // produces cache hits within a training session at 2x write cost vs 5x read savings.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(profile, readinessScore),
        },
      ],
    })

    // Log cache stats server-side to verify caching is active (never expose to client)
    if (msg.usage) {
      const usage = msg.usage as unknown as Record<string, unknown>
      console.log('[generateSessionAction] token usage:', {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      })
    }

    // Extract text from response (Pitfall 2: must access .content[0].text, not the response object)
    rawText = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  } catch {
    return { error: 'Generation failed. Please try again in a moment.' }
  }

  // ── Step 5: Zod validate ──────────────────────────────────────────────────
  // Strip markdown fences defensively (Pitfall 3: Claude sometimes wraps JSON in ```json)
  const stripped = rawText
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')

  let jsonParsed: unknown
  try {
    jsonParsed = JSON.parse(stripped)
  } catch {
    return { error: "Couldn't generate a valid session. Please try again." }
  }

  const zodResult = GeneratedSessionSchema.safeParse(jsonParsed)
  if (!zodResult.success) {
    // Server-log only — never surface .issues to the client (T-03-07)
    console.error('[generateSessionAction] Zod issues:', zodResult.error.issues)
    return { error: "Couldn't generate a valid session. Please try again." }
  }

  // ── Step 6: Safety gate ───────────────────────────────────────────────────
  // Runs AFTER Zod (D-09 order). Input is always a valid GeneratedSession at this point.
  const safety = validateSessionSafety(zodResult.data)
  if (!safety.safe) {
    // Server-log only — never surface reason to the client (T-03-07)
    console.error('[generateSessionAction] Safety gate failed:', safety.reason)
    return { error: "Couldn't generate a valid session. Please try again." }
  }

  // ── Step 7: Compute watt targets + DB write ───────────────────────────────
  const blocksWithWatts = computeWattTargets(
    zodResult.data.blocks,
    profile?.ftp ?? null
  )

  const [inserted] = await db
    .insert(trainingSessions)
    .values({
      userId,
      title: zodResult.data.title,
      notes: zodResult.data.notes,
      readinessScore,
      // Cast required: Drizzle jsonb column type requires unknown cast (Pitfall 7)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocks: blocksWithWatts as unknown as any,
      totalDurationSec: zodResult.data.totalDurationSec,
      rawJson: rawText,   // stored server-only for debugging; never returned to client
    })
    .returning()

  // ── Step 8: Return ────────────────────────────────────────────────────────
  return { data: inserted }
}
