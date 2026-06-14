# Phase 3: AI Session Generation — Research

**Researched:** 2026-06-14
**Domain:** Anthropic SDK + Zod validation + Server Actions + Upstash rate limiting
**Confidence:** HIGH (all critical paths verified against live codebase; SDK docs fetched from official source)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** — `training_sessions` migration columns: `title text NOT NULL`, `notes text`, `readiness_score integer NOT NULL`, `blocks jsonb NOT NULL`, `total_duration_sec integer NOT NULL`, `raw_json text` (nullable, server-only).

**D-02** — Block JSON shape: `{order, type, durationSec, powerFraction, targetWatts, rpe, description}`. Both `powerFraction` AND `targetWatts` always present. With FTP: Claude returns `powerFraction`, server computes `targetWatts = round(powerFraction * ftp)`. Without FTP: Claude returns `targetWatts`, server computes `powerFraction = targetWatts / 150`.

**D-03** — Zod output schema: `SessionBlockSchema` + `GeneratedSessionSchema`. `powerFraction` bounds `[0.1, 1.8]`. `durationSec` max 5400. `totalDurationSec` max 14400. Use `error.issues` (Zod v4, not `.errors`).

**D-04** — Safety gate `validateSessionSafety(session)`: (1) `totalDurationSec ≤ 14400`, (2) no single block `powerFraction > 1.5`, (3) no more than 3 consecutive `type:"work"` blocks without rest/cooldown, (4) `blocks.length ≥ 2`. Returns `{safe: boolean; reason?: string}`. Reason server-log only.

**D-05** — `@anthropic-ai/sdk` `messages.create()`, model `claude-sonnet-4-6`, system message with `cache_control: {type: "ephemeral"}`. System prompt MUST be ≥1,024 tokens.

**D-06** — System prompt: cycling coach role, JSON-only output contract with embedded schema, no-FTP conservative watt guidance (beginner 100–150W, injury 80–130W), interval structure guidance.

**D-07** — User prompt: XML delimiters for user free-text (`<user_profile>`, `<injury_notes>`). Readiness labels: 0=Flat, 1=OK, 2=Good, 3=Fresh.

**D-08** — Server Action `generateSessionAction(readinessScore: number)` in `src/lib/actions/session.ts`. Returns `{data?: GeneratedSession; error?: string}`. Not a Route Handler; not streaming.

**D-09** — Execution order: (1) authenticate, (2) read profile, (3) rate limit check, (4) Anthropic call, (5) Zod validate, (6) safety gate, (7) DB write, (8) return `{data}`. On Zod/safety failure: `{error: "Couldn't generate a valid session. Please try again."}`. On API error: `{error: "Generation failed. Please try again in a moment."}`.

**D-10** — `generationLimiter`: 10 requests / 24 hours per `userId`. Prefix: `rl:generate:user`. Sliding window. Fail-open in local dev. User-visible message: `"Daily limit reached. Try again tomorrow."`.

**D-11** — Readiness tap-selector: four buttons labeled "0 — Flat", "1 — OK", "2 — Good", "3 — Fresh". Selected score highlighted.

**D-12** — Generator below existing FTP status line on dashboard. Loading via `useTransition` (spinner on button). On success: compact session summary card (title, total duration, block count). No redirect.

**D-13** — Error display via existing `ErrorBanner` (`src/components/ui/error-banner.tsx`).

### Claude's Discretion

- Exact system prompt wording and padding to reach ≥1,024 tokens
- Anthropic SDK `maxTokens` value (recommend 1,024–2,048)
- Exact Drizzle migration file naming and column order
- Exact tap-selector visual design (active state, spacing) within the Tailwind/shadcn system

### Deferred Ideas (OUT OF SCOPE)

- Session preview/regeneration before committing (GEN-V2-01)
- Post-ride feedback notes feeding future context (GEN-V2-02)
- Streaming Server-Sent Events for generation
- Model fallback (sonnet → haiku) on timeout
- Session history list
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GEN-01 | User generates a session by entering readiness score (0–3 tap-selector); prompt uses profile (FTP, goals, injuries) | D-05–D-07, D-11: SDK call pattern, prompt template, tap-selector UI |
| GEN-02 | AI output validated against Zod schema before DB write; malformed/out-of-bounds sessions rejected with user-visible fallback | D-03–D-04, D-09: schema spec, safety gate, execution order |
| GEN-03 | AI generation endpoint rate-limited per user per day | D-10: `generationLimiter` using `@upstash/ratelimit` sliding window on `userId` |
</phase_requirements>

---

## Summary

Phase 3 adds the core AI generation loop to the existing Phase 2 foundation. The implementation is end-to-end: a tap-selector on the dashboard triggers a Server Action that calls the Anthropic API, validates the JSON response through a two-layer gate (Zod schema + deterministic safety function), and writes the validated session to a new `training_sessions` migration.

Every component in this phase follows an established pattern in the codebase: the Server Action shape mirrors `saveProfileAction`, the rate limiter extends the existing `UPSTASH_AVAILABLE` guard in `ratelimit.ts`, Zod schemas live in `src/lib/db/schemas/`, and the dashboard UI uses `useTransition` (since this is an imperative button call, not a form action — `useActionState` is reserved for form-based actions).

**Primary recommendation:** Implement in five work units — (1) DB migration, (2) Zod schema + safety gate, (3) `generationLimiter` extension, (4) `generateSessionAction` with Anthropic call, (5) dashboard UI (tap-selector + session summary card). The Zod schema and safety gate should be implemented and tested before the Anthropic call to avoid wasted API spend during development.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Readiness tap-selector | Browser/Client | — | Pure UI state; no server round-trip until "Generate" is tapped |
| Session generation (Anthropic call) | API/Backend (Server Action) | — | API key must never reach client bundle (Phase 1 D-13 truth-condition) |
| Zod output validation | API/Backend (Server Action) | — | Trust boundary enforcement happens server-side before any DB write |
| Deterministic safety gate | API/Backend (Server Action) | — | Same execution layer as Zod; both run before DB write (D-09 order) |
| Per-user rate limiting | API/Backend (Server Action) | Upstash Redis | Checked in Server Action before Anthropic call to prevent wasted spend |
| Session persistence | Database/Storage | — | `training_sessions` table via Drizzle + Neon |
| Session summary display | Browser/Client | — | Rendered inline on dashboard from Server Action return value |

---

## Standard Stack

### Core — No new packages required

All packages needed for Phase 3 are already installed as part of the Phase 1/2 foundation.

| Library | Installed Version | Purpose | Status |
|---------|------------------|---------|--------|
| `@anthropic-ai/sdk` | 0.104.1 | Claude API client | Already in package.json |
| `zod` | 4.4.3 | AI output schema validation | Already in package.json |
| `@upstash/ratelimit` | 2.0.8 | Per-user daily generation limit | Already in package.json |
| `@upstash/redis` | latest | Upstash HTTP client | Already in package.json |
| `drizzle-orm` | 0.45.2 | DB schema extension + insert | Already in package.json |
| `iron-session` | 8.0.4 | Auth in Server Action | Already in package.json |

**Installation:** No new packages. Phase 3 is purely implementation against the existing stack.

**Version verification:** All versions confirmed via `npm view` during research. `@anthropic-ai/sdk@0.104.1`, `zod@4.4.3`, `@upstash/ratelimit@2.0.8`. [VERIFIED: npm registry]

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@anthropic-ai/sdk` | npm | ~2 yrs | 23.5M/wk | github.com/anthropics/anthropic-sdk-typescript | SUS (too-new latest) | Approved — official Anthropic SDK; latest version published 2026-06-09. Flagged by automation due to recency of latest release, not the package itself. |
| `@upstash/ratelimit` | npm | ~3 yrs | 1.57M/wk | (no repo in registry metadata) | SUS (no-repository) | Approved — official Upstash package; well-established, referenced in Next.js docs. Registry metadata missing repo URL only. |
| `@upstash/redis` | npm | established | 3.54M/wk | github.com/upstash/redis-js | OK | Approved |
| `drizzle-orm` | npm | established | 11.1M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `@neondatabase/serverless` | npm | established | 2.58M/wk | github.com/neondatabase/serverless | OK | Approved |
| `iron-session` | npm | established | 1.68M/wk | github.com/vvo/iron-session | OK | Approved |

**Packages removed due to SLOP verdict:** none

**Packages flagged as suspicious SUS:** `@anthropic-ai/sdk` and `@upstash/ratelimit` — both are well-established official packages flagged only due to automated signals (recency / missing registry metadata), not legitimacy concerns. No `checkpoint:human-verify` needed.

---

## Architecture Patterns

### System Architecture Diagram

```
Dashboard Page (RSC)
    │
    │  renders
    ▼
SessionGenerator (Client Component)
    │  user taps readiness (0–3), clicks Generate
    │  useTransition → startTransition(async () => { ... })
    │
    ▼
generateSessionAction(readinessScore) — Server Action
    │
    ├─[1] getIronSession → verify userId
    ├─[2] findUserProfileByUserId(userId) → profile
    ├─[3] generationLimiter.limit(userId) → block if exceeded
    ├─[4] Anthropic client.messages.create(prompt) → raw JSON string
    ├─[5] GeneratedSessionSchema.safeParse(JSON.parse(raw)) → Zod check
    ├─[6] validateSessionSafety(parsed) → safety gate
    ├─[7] db.insert(trainingSessions).values({...}).returning()
    └─[8] return { data: session } | { error: string }
              │
              ▼
    Dashboard shows session summary card OR ErrorBanner
```

### Recommended Project Structure (new files only)

```
src/
├── lib/
│   ├── actions/
│   │   └── session.ts           # generateSessionAction (D-08)
│   ├── db/
│   │   ├── schema.ts            # extend trainingSessions columns (D-01)
│   │   ├── schemas/
│   │   │   └── session.ts       # Zod GeneratedSessionSchema (D-03)
│   │   └── migrations/
│   │       └── 0003_training_sessions_content.sql  # Drizzle migration
│   ├── ratelimit.ts             # add generationLimiter (D-10, extend existing)
│   └── safety-gate.ts           # validateSessionSafety (D-04)
├── components/
│   └── session/
│       └── session-generator.tsx  # tap-selector + generate button (D-11, D-12)
```

### Pattern 1: Anthropic SDK messages.create with Prompt Caching

The `system` parameter accepts an array when using `cache_control`. This is a breaking departure from the simple `system: string` form. [CITED: platform.claude.com/docs/en/docs/build-with-claude/prompt-caching]

```typescript
// Source: platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT, // must be ≥1,024 tokens for cache to activate
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [
    {
      role: "user",
      content: userPrompt,
    },
  ],
});

// Response shape: response.content[0].type === "text"
const rawText = response.content[0].type === "text" ? response.content[0].text : "";

// Verify caching occurred (log server-side only):
// response.usage.cache_creation_input_tokens > 0 → first write to cache
// response.usage.cache_read_input_tokens > 0 → cache hit (5× cheaper reads)
```

**Critical constraint:** `system` must be an array (not a string) when using `cache_control`. The model for `claude-sonnet-4-6` requires ≥1,024 tokens minimum. No error is thrown if under the threshold — caching is silently skipped. Verify via `response.usage.cache_creation_input_tokens`. [CITED: platform.claude.com/docs/en/docs/build-with-claude/prompt-caching]

### Pattern 2: Zod v4 AI Output Schema

Following the existing `src/lib/db/schemas/profile.ts` pattern: [ASSUMED based on D-03 spec + existing codebase pattern]

```typescript
// src/lib/db/schemas/session.ts
import { z } from "zod";

export const SessionBlockSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(["warmup", "work", "rest", "cooldown"]),
  durationSec: z.number().int().positive().max(5400),
  powerFraction: z.number().min(0.1).max(1.8),
  targetWatts: z.number().int().positive(),
  rpe: z.enum(["Easy", "Moderate", "Hard", "Very Hard"]),
  description: z.string().min(1).max(200),
});

export const GeneratedSessionSchema = z.object({
  title: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  totalDurationSec: z.number().int().positive().max(14400),
  blocks: z.array(SessionBlockSchema).min(1).max(20),
});

export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>;
```

**Zod v4 critical:** `error.issues` not `error.errors` — already enforced in the codebase (see `saveProfileAction`). [VERIFIED: existing codebase pattern in `src/lib/actions/profile.ts`]

### Pattern 3: Drizzle schema extension with jsonb

`jsonb` is available from `drizzle-orm/pg-core`. [VERIFIED: npm registry — `typeof jsonb === 'function'` confirmed]

```typescript
// Extension to trainingSessions in src/lib/db/schema.ts
import { pgTable, uuid, text, timestamp, index, integer, jsonb } from "drizzle-orm/pg-core";

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Phase 3 columns:
    title: text("title").notNull(),
    notes: text("notes"),
    readinessScore: integer("readiness_score").notNull(),
    blocks: jsonb("blocks").notNull(),
    totalDurationSec: integer("total_duration_sec").notNull(),
    rawJson: text("raw_json"),  // nullable; debug only; never display to user
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("training_sessions_user_id_idx").on(t.userId)]
);
```

**Insert with returning:**
```typescript
const [session] = await db
  .insert(trainingSessions)
  .values({
    userId: session.id,
    title: parsed.title,
    notes: parsed.notes,
    readinessScore: readinessScore,
    blocks: parsed.blocks,          // Drizzle serializes jsonb automatically
    totalDurationSec: parsed.totalDurationSec,
    rawJson: rawText,
  })
  .returning();
```

### Pattern 4: generationLimiter — extending ratelimit.ts

Extend `src/lib/ratelimit.ts` following the existing `ipLimiter`/`emailLimiter` pattern. The same `UPSTASH_AVAILABLE` guard and `PASS_THROUGH` object cover the new limiter. [VERIFIED: existing codebase — `src/lib/ratelimit.ts`]

```typescript
// Add to src/lib/ratelimit.ts
export const generationLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "24 h"),
      prefix: "rl:generate:user",
    })
  : PASS_THROUGH;

// Usage in Server Action:
const limitResult = await generationLimiter.limit(userId);
if (!limitResult.success) {
  return { error: "Daily limit reached. Try again tomorrow." };
}
```

### Pattern 5: generateSessionAction — Server Action shape

Follows `saveProfileAction` pattern exactly. Key difference: no `FormData` input (takes typed number argument), no `redirect()` at the end (returns data inline). [VERIFIED: existing codebase — `src/lib/actions/profile.ts`]

```typescript
"use server";

export async function generateSessionAction(
  readinessScore: number
): Promise<{ data?: GeneratedSession; error?: string }> {
  // 1. Auth gate (same as saveProfileAction)
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.id) return { error: "Not authenticated" };

  // 2–8. See D-09 execution order
  // ...
  return { data: insertedSession };
}
```

### Pattern 6: Dashboard — useTransition for imperative Server Action call

The generation trigger is NOT form-based (no FormData). Use `useTransition` for imperative async call, not `useActionState`. `useActionState` is reserved for form actions that receive `FormData`. [VERIFIED: existing codebase — `onboarding-wizard.tsx` uses `useActionState` for form; this pattern differs] [ASSUMED: useTransition is the correct choice for non-form Server Action invocation]

```typescript
"use client";
import { useTransition, useState } from "react";
import { generateSessionAction } from "@/lib/actions/session";

export function SessionGenerator({ /* ... */ }) {
  const [isPending, startTransition] = useTransition();
  const [readiness, setReadiness] = useState<number | null>(null);
  const [result, setResult] = useState<{ data?: GeneratedSession; error?: string } | null>(null);

  function handleGenerate() {
    if (readiness === null) return;
    startTransition(async () => {
      const res = await generateSessionAction(readiness);
      setResult(res);
    });
  }

  return (
    // ... tap-selector + generate button + result card + ErrorBanner
  );
}
```

**Note on revalidatePath + useTransition bug:** There is a documented Next.js 15+ bug where `isPending` stays `true` indefinitely if `revalidatePath()` is called inside a Server Action wrapped in `startTransition`. This phase's action does NOT call `revalidatePath` — it writes to DB and returns `{data}` for inline display. The bug does not apply here. [CITED: github.com/vercel/next.js/discussions/82289]

### Anti-Patterns to Avoid

- **Simple string system prompt with cache_control:** `system: "text"` cannot carry `cache_control`. Must use `system: [{type:"text", text:"...", cache_control:{type:"ephemeral"}}]` array form.
- **Trusting AI JSON directly:** Never pass `response.content[0].text` to DB without `JSON.parse` + Zod parse + safety gate. The action execution order (D-09) is a hard contract.
- **Revealing technical error details:** Generic error messages for all Zod/safety failures — same anti-enumeration philosophy as auth. Never surface `error.issues[0].message` to the client.
- **Chained .where() in Drizzle:** Even for inserting sessions, when reading them back, always use `and()` single-call pattern (Phase 1 D-03 truth-condition).
- **Using `useActionState` for the generate button:** `useActionState` requires a `FormData`-compatible action signature. The generation trigger is imperative; use `useTransition`.
- **Calling `revalidatePath` in the generation action:** Would trigger the useTransition/isPending bug in Next.js 15+. Show the session summary from the return value instead of refreshing the page.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI output validation | Custom JSON parser with if-checks | Zod `GeneratedSessionSchema.safeParse()` | Edge cases in nested structure; type inference is free with Zod |
| Rate limiting per user | Counter in Postgres + timestamp check | `@upstash/ratelimit` sliding window | Race conditions, atomic operations, TTL management — all handled by Upstash |
| JSON parsing with error recovery | try-catch with manual field extraction | Zod `safeParse` + early return | Zod reports all issues simultaneously; custom parsing misses coercion |
| Safety gate via Zod alone | Tighter Zod bounds | Separate `validateSessionSafety()` function | Defense-in-depth; safety logic is readable, testable, and independent of schema concerns |

**Key insight:** The two-layer validation (Zod + safety gate) is intentional. Zod enforces structure and type bounds; the safety gate enforces physiological safety logic. Collapsing them into one Zod schema embeds coaching logic in the type system, making it harder to audit.

---

## Common Pitfalls

### Pitfall 1: System prompt under 1,024 tokens — silent cache miss

**What goes wrong:** Caching appears configured but never activates. No error is raised. Every request pays full input token cost.
**Why it happens:** `claude-sonnet-4-6` has a 1,024 token minimum. The system prompt must reach this threshold before `cache_control: {type:"ephemeral"}` has any effect.
**How to avoid:** Write the full system prompt, count tokens, pad with cycling coaching detail (interval type explanations, schema documentation, coaching philosophy) until ≥1,024 tokens confirmed. Log `response.usage.cache_creation_input_tokens` on the first request to verify activation.
**Warning signs:** `response.usage.cache_read_input_tokens === 0` on all requests after the first.

### Pitfall 2: JSON.parse on raw Claude response without text extraction

**What goes wrong:** `JSON.parse(response)` throws because `response` is the full messages response object, not a string.
**Why it happens:** `client.messages.create()` returns a `Message` object. The text is in `response.content[0].text`.
**How to avoid:** `const rawText = response.content[0].type === "text" ? response.content[0].text : ""; const parsed = JSON.parse(rawText);`

### Pitfall 3: Claude wraps JSON in markdown code fences

**What goes wrong:** `JSON.parse("```json\n{...}\n```")` throws SyntaxError.
**Why it happens:** Claude sometimes wraps JSON output in markdown fences even when instructed not to.
**How to avoid:** System prompt must be explicit: "Respond with ONLY a valid JSON object. No markdown. No explanation. No code fences." Consider a fallback regex strip: `rawText.replace(/^```json?\n?/, '').replace(/\n?```$/, '')`.
**Warning signs:** JSON.parse errors in logs despite valid AI responses.

### Pitfall 4: powerFraction vs targetWatts computation path branching

**What goes wrong:** When FTP is absent, `targetWatts / 150` is exposed as the user's "FTP" in future UI.
**Why it happens:** The 150W reference constant is a Phase 4 `.zwo` export artifact. It should never appear in user-facing UI as an FTP value.
**How to avoid:** Store `powerFraction` computed from the reference — but the reference value 150 is only for Phase 4 internal use. Phase 3 schema stores both fields; UI shows `targetWatts`. Never display the reference value.

### Pitfall 5: Safety gate running before Zod parse

**What goes wrong:** Safety gate receives partially-typed input and throws on `undefined` properties.
**Why it happens:** D-09 execution order: Zod runs first, safety gate second. Reversing this means the safety gate cannot trust field presence.
**How to avoid:** Enforce D-09 order strictly: `const result = schema.safeParse(...)` — if `!result.success` return error immediately — then `validateSessionSafety(result.data)`.

### Pitfall 6: generationLimiter keyed on email instead of userId

**What goes wrong:** Users can bypass the daily limit by varying email capitalization or using email aliases.
**Why it happens:** Copying the `emailLimiter` pattern without changing the key.
**How to avoid:** Key is `userId` (UUID from iron-session). `await generationLimiter.limit(session.id)`.

### Pitfall 7: Drizzle jsonb column not accepting typed Block array

**What goes wrong:** TypeScript complains that `blocks: parsed.blocks` is not assignable to `jsonb` column type.
**Why it happens:** Drizzle `jsonb()` column type is `JsonValue` at runtime but needs a type cast in TypeScript.
**How to avoid:** Cast if needed: `blocks: parsed.blocks as unknown as JsonValue`. The value is validated before insert; the cast is safe.

---

## Code Examples

### Anthropic SDK call with prompt caching

```typescript
// Source: platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT,  // ≥1,024 tokens required for caching
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [{ role: "user", content: buildUserPrompt(profile, readinessScore) }],
});

const rawText =
  response.content[0].type === "text" ? response.content[0].text : "";
```

### Full execution order — generateSessionAction skeleton

```typescript
"use server";
// Source: D-09 from 03-CONTEXT.md

export async function generateSessionAction(
  readinessScore: number
): Promise<{ data?: InsertedSession; error?: string }> {
  // 1. Auth
  const ironSession = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!ironSession.id) return { error: "Not authenticated" };
  const userId = ironSession.id;

  // 2. Profile
  const profile = await findUserProfileByUserId(userId);

  // 3. Rate limit
  const limitResult = await generationLimiter.limit(userId);
  if (!limitResult.success) {
    return { error: "Daily limit reached. Try again tomorrow." };
  }

  // 4. AI call
  let rawText: string;
  try {
    const msg = await anthropic.messages.create({ /* ... */ });
    rawText = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch {
    return { error: "Generation failed. Please try again in a moment." };
  }

  // 5. Zod validate
  let jsonParsed: unknown;
  try {
    const stripped = rawText.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    jsonParsed = JSON.parse(stripped);
  } catch {
    return { error: "Couldn't generate a valid session. Please try again." };
  }
  const zodResult = GeneratedSessionSchema.safeParse(jsonParsed);
  if (!zodResult.success) {
    console.error("Zod issues:", zodResult.error.issues);  // server-log only
    return { error: "Couldn't generate a valid session. Please try again." };
  }

  // 6. Safety gate
  const safety = validateSessionSafety(zodResult.data);
  if (!safety.safe) {
    console.error("Safety gate failed:", safety.reason);  // server-log only
    return { error: "Couldn't generate a valid session. Please try again." };
  }

  // 7. Compute computed fields + DB write
  const blocksWithWatts = computeWattTargets(zodResult.data.blocks, profile?.ftp ?? null);
  const [inserted] = await db.insert(trainingSessions).values({
    userId,
    title: zodResult.data.title,
    notes: zodResult.data.notes,
    readinessScore,
    blocks: blocksWithWatts,
    totalDurationSec: zodResult.data.totalDurationSec,
    rawJson: rawText,
  }).returning();

  // 8. Return
  return { data: inserted };
}
```

### Safety gate

```typescript
// Source: D-04 from 03-CONTEXT.md
export function validateSessionSafety(
  session: GeneratedSession
): { safe: boolean; reason?: string } {
  // 1. Duration ceiling (defense-in-depth — also in Zod)
  if (session.totalDurationSec > 14400) {
    return { safe: false, reason: "Session exceeds 4-hour limit" };
  }
  // 2. No single block > 1.5 FTP (tighter than Zod's 1.8)
  for (const block of session.blocks) {
    if (block.powerFraction > 1.5) {
      return { safe: false, reason: `Block ${block.order}: powerFraction ${block.powerFraction} > 1.5` };
    }
  }
  // 3. No more than 3 consecutive work blocks
  let consecutive = 0;
  for (const block of session.blocks) {
    if (block.type === "work") {
      consecutive++;
      if (consecutive > 3) {
        return { safe: false, reason: "More than 3 consecutive work blocks without rest" };
      }
    } else if (block.type === "rest" || block.type === "cooldown") {
      consecutive = 0;
    }
  }
  // 4. Minimum structure
  if (session.blocks.length < 2) {
    return { safe: false, reason: "Session must have at least 2 blocks" };
  }
  return { safe: true };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `system: string` | `system: [{type:"text", text, cache_control}]` | Anthropic prompt caching launch | Required for cache activation |
| Prompt caching TTL 1 hour default | TTL 5 minutes default (1h available at cost) | March 2026 | Matters if system prompt changes rarely; consider `ttl:"1h"` for the per-user single-system-prompt use case |
| `error.errors` (Zod v3) | `error.issues` (Zod v4) | Zod v4 mid-2025 | Breaking change; already in codebase |
| `useFormStatus` + form action | `useTransition` for imperative calls | App Router pattern | `useActionState` is for form-based actions only |

**Deprecated / outdated:**
- `system: "string"` when using prompt caching — must be array form
- `error.errors` — use `error.issues` (Zod v4)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useTransition` is the correct loading pattern for an imperative (non-form) Server Action call | Pattern 6, Pitfall note | If wrong, could use `useState` + manual loading flag instead — either works |
| A2 | `jsonb` Drizzle column accepts `parsed.blocks as unknown as JsonValue` without runtime error | Pattern 3, Pitfall 7 | Type assertion is safe given pre-insert Zod validation; worst case is a Drizzle type error at compile time only |
| A3 | Regex strip for markdown fences is sufficient fallback for Claude JSON wrapping | Pitfall 3 | If Claude uses unusual wrapping, JSON.parse still throws and the graceful error handler fires |
| A4 | `ttl: "1h"` for `cache_control` is optional for this use case (5-min TTL sufficient) | Pattern 1 | The system prompt is constant per server deploy; 5-min TTL means cache expires between user requests. For single-owner v1 deployment, 1h TTL likely worth the 2x write cost. Planner should decide. |

---

## Open Questions

1. **Prompt caching TTL — 5 min vs 1 hour**
   - What we know: Default TTL dropped to 5 minutes in March 2026. 1h TTL is available at 2x write cost with `cache_control: {type:"ephemeral", ttl:"1h"}`.
   - What's unclear: For a single-owner v1 deployment with infrequent generation, will the 5-min TTL ever actually produce cache hits? Each ride session might be hours apart.
   - Recommendation: Use `ttl:"1h"` from the start. The system prompt is static; 1h almost always hits on subsequent requests within a session; 2x write cost on a ≥1024-token prompt is negligible vs. cache read savings.

2. **System prompt token count target**
   - What we know: ≥1,024 tokens required; no error on under-threshold (silent skip).
   - What's unclear: Exact token count of the planned prompt prose before padding.
   - Recommendation: Draft the prompt, verify with `anthropic.messages.countTokens()` or the Anthropic console. Target 1,200+ tokens to have comfortable margin.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 | ✓ | 20+ | — |
| `ANTHROPIC_API_KEY` env var | generateSessionAction | unknown (not checked at research time) | — | Cannot generate; action returns error |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` env vars | generationLimiter | unknown (Phase 1 set for auth; same vars) | — | Fail-open via UPSTASH_AVAILABLE guard |
| Neon `DATABASE_URL` | DB insert | ✓ (Phase 1/2 working) | — | — |

**Missing dependencies with no fallback:**
- `ANTHROPIC_API_KEY` must be set in `.env.local` before Phase 3 can be manually tested. Add to `.env.local` as part of Wave 0 setup.

**Missing dependencies with fallback:**
- Upstash env vars: if absent in local dev, `UPSTASH_AVAILABLE` guard causes `generationLimiter` to use `PASS_THROUGH` (unlimited).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, `vitest.config.ts`) |
| Config file | `/vitest.config.ts` |
| Quick run command | `npx vitest run tests/session-schema.test.ts tests/safety-gate.test.ts tests/ratelimit.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEN-01 | Zod schema accepts valid block array | unit | `npx vitest run tests/session-schema.test.ts` | ❌ Wave 0 |
| GEN-02 | Zod schema rejects powerFraction outside [0.1, 1.8] | unit | `npx vitest run tests/session-schema.test.ts` | ❌ Wave 0 |
| GEN-02 | Zod schema rejects missing required fields | unit | `npx vitest run tests/session-schema.test.ts` | ❌ Wave 0 |
| GEN-02 | Safety gate rejects powerFraction > 1.5 | unit | `npx vitest run tests/safety-gate.test.ts` | ❌ Wave 0 |
| GEN-02 | Safety gate rejects >3 consecutive work blocks | unit | `npx vitest run tests/safety-gate.test.ts` | ❌ Wave 0 |
| GEN-02 | Safety gate rejects session < 2 blocks | unit | `npx vitest run tests/safety-gate.test.ts` | ❌ Wave 0 |
| GEN-02 | Safety gate accepts valid session | unit | `npx vitest run tests/safety-gate.test.ts` | ❌ Wave 0 |
| GEN-03 | generationLimiter uses slidingWindow(10, "24 h") and prefix "rl:generate:user" | unit | `npx vitest run tests/ratelimit.test.ts` | ✅ (extend existing) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/session-schema.test.ts tests/safety-gate.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/session-schema.test.ts` — covers GEN-01, GEN-02 Zod validation
- [ ] `tests/safety-gate.test.ts` — covers GEN-02 safety gate logic (all 4 checks)
- [ ] Extend `tests/ratelimit.test.ts` — add `generationLimiter` config assertions (GEN-03)
- [ ] `ANTHROPIC_API_KEY` in `.env.local` — required for manual E2E test (document in Wave 0 setup task)

---

## Security Domain

### Applicable ASVS Categories (ASVS Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | iron-session read in Server Action; redirect if no session.id |
| V3 Session Management | no | Session already managed by Phase 1; no new session handling |
| V4 Access Control | yes | `userId` from session only (never from client input); rate limit per authenticated userId |
| V5 Input Validation | yes | Zod `GeneratedSessionSchema.safeParse()` on ALL AI output before DB write |
| V6 Cryptography | no | No new crypto; Anthropic call uses HTTPS; no tokens stored |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via user free-text | Tampering | XML delimiters (`<user_profile>`, `<injury_notes>`) isolate user content as data; system prompt is server-only |
| AI output trusted without validation | Spoofing | Two-layer gate: Zod schema (D-03) + safety gate (D-04) before DB write |
| Runaway AI spend | Denial of Service | `generationLimiter`: 10/24h per userId via Upstash sliding window (GEN-03) |
| API key exposure in client bundle | Information Disclosure | `ANTHROPIC_API_KEY` imported from `src/env.ts` (server-only module); no `NEXT_PUBLIC_` prefix (Phase 1 D-13) |
| Cross-user session read | Elevation of Privilege | `findUserProfileByUserId(userId)` uses `userId` from iron-session cookie; no client-supplied userId accepted |

**Prompt injection mitigation note:** User-controlled fields (`goals`, `injuries`) are wrapped in XML tags in the user prompt, not concatenated into the system prompt. The system prompt is a static server-side constant. This follows the PROJECT.md §AI prompt safety constraint verbatim. [VERIFIED: existing codebase — `src/lib/copy.ts` prompt safety pattern; PROJECT.md §AI prompt safety]

---

## Sources

### Primary (MEDIUM confidence — Context7/official docs)
- [Anthropic Prompt Caching docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) — `system` array API shape, 1024-token minimum, cache_control TTL
- [Upstash Ratelimit + Next.js](https://upstash.com/blog/nextjs-ratelimiting) — `slidingWindow`, `limit(identifier)` call signature

### Secondary (LOW confidence — community/verified via codebase)
- [vercel/next.js discussion #82289](https://github.com/vercel/next.js/discussions/82289) — `useTransition` + `revalidatePath` bug in Next.js 15+; confirmed does not apply to this action's pattern
- Existing codebase: `src/lib/ratelimit.ts`, `src/lib/actions/profile.ts`, `src/components/onboarding/onboarding-wizard.tsx`, `src/lib/db/schemas/profile.ts` — all VERIFIED by direct file read

### Codebase (HIGH confidence — verified by direct inspection)
- `src/lib/db/schema.ts` — current `trainingSessions` stub; `jsonb` import confirmed
- `src/lib/ratelimit.ts` — `UPSTASH_AVAILABLE` / `PASS_THROUGH` pattern
- `src/lib/actions/profile.ts` — Server Action shape template
- `src/lib/db/queries.ts` — IDOR-safe `and()` pattern; `findUserProfileByUserId` export
- `src/lib/session.ts` — `SessionData` type; `sessionOptions` export
- `src/env.ts` — `ANTHROPIC_API_KEY` declaration confirmed
- `src/components/ui/error-banner.tsx` — `ErrorBanner` props: `{message: string | null}`
- `vitest.config.ts` + `tests/*.test.ts` — test framework and existing patterns

---

## Metadata

**Confidence breakdown:**
- DB migration schema: HIGH — locked by D-01/D-02; existing Drizzle patterns verified
- Anthropic SDK call pattern: MEDIUM — fetched from official docs; code shape confirmed
- Zod schema: HIGH — locked by D-03; existing Zod v4 patterns verified in codebase
- Safety gate logic: HIGH — locked by D-04; pure deterministic function
- Rate limiter: HIGH — locked by D-10; existing `ratelimit.ts` pattern verified
- UI pattern (useTransition): MEDIUM — documented pattern; minor risk re: Next.js 15+ nuances

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (30 days; SDK/Zod APIs are stable)
