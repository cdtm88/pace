# Phase 3: AI Session Generation - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the Claude integration end-to-end: accept a readiness score (0–3) from the user, combine it with their persisted profile (FTP, goals, injuries), call `claude-sonnet-4-6` with a cache-controlled system prompt, validate the JSON output against a Zod schema, run a deterministic safety gate, write the session to the database, and surface a generation limit when the per-user daily cap is reached.

**In scope:** `training_sessions` schema migration (add session content columns), Zod output schema, `generateSessionAction` Server Action, Anthropic SDK call, safety gate function, per-user daily rate limiter, readiness tap-selector on dashboard, session summary confirmation UI.

**Out of scope:** Glanceable on-bike watt display (Phase 4), `.zwo` export (Phase 4), Strava match (Phase 5), session history list (v2 requirement — out of scope for v1).

</domain>

<decisions>
## Implementation Decisions

### DB Schema — training_sessions migration

- **D-01:** Extend `training_sessions` with these columns (via Drizzle migration against `DATABASE_URL_UNPOOLED`):
  - `title text NOT NULL` — generated session name (e.g. "Threshold Ladder 45 min")
  - `notes text` — optional brief description from Claude
  - `readiness_score integer NOT NULL` — 0–3 input from user
  - `blocks jsonb NOT NULL` — array of interval block objects (see D-02)
  - `total_duration_sec integer NOT NULL` — sum of all block durations
  - `raw_json text` — full Claude response string for debugging (nullable; server only)
  
- **D-02:** Block JSON structure (one element per interval block, stored in the `blocks` jsonb column):
  ```json
  {
    "order": 1,
    "type": "warmup" | "work" | "rest" | "cooldown",
    "durationSec": 300,
    "powerFraction": 0.55,
    "targetWatts": 165,
    "rpe": "Easy" | "Moderate" | "Hard" | "Very Hard",
    "description": "Easy spin to loosen up"
  }
  ```
  Both `powerFraction` and `targetWatts` are ALWAYS present:
  - **With FTP:** Claude returns `powerFraction` → `targetWatts = round(powerFraction * ftp)` computed server-side before DB write.
  - **Without FTP:** Claude returns `targetWatts` (conservative absolute watts) → `powerFraction = targetWatts / 150` computed server-side (150W reference for Phase 4 .zwo export; never show raw reference value to user).

### Zod Output Schema

- **D-03:** Zod schema for Claude JSON output (validate BEFORE safety gate):
  ```ts
  const SessionBlockSchema = z.object({
    order: z.number().int().positive(),
    type: z.enum(["warmup", "work", "rest", "cooldown"]),
    durationSec: z.number().int().positive().max(5400),   // ≤90 min per block (STATE.md)
    powerFraction: z.number().min(0.1).max(1.8),          // GEN-02; STATE.md
    targetWatts: z.number().int().positive(),
    rpe: z.enum(["Easy", "Moderate", "Hard", "Very Hard"]),
    description: z.string().min(1).max(200),
  });

  const GeneratedSessionSchema = z.object({
    title: z.string().min(1).max(100),
    notes: z.string().max(500).optional(),
    totalDurationSec: z.number().int().positive().max(14400), // ≤4h (STATE.md)
    blocks: z.array(SessionBlockSchema).min(1).max(20),
  });
  ```

  Note: `error.issues` (not `.errors`) — Zod v4 breaking change (CLAUDE.md).

### Safety Gate

- **D-04:** Deterministic `validateSessionSafety(session)` function runs AFTER Zod parse (GEN-02 / success criteria #3). This is a separate layer — not AI, not Zod. Checks:
  1. `totalDurationSec ≤ 14400` (4 hours) — already covered by Zod, re-checked here for defense-in-depth
  2. No single block `powerFraction > 1.5` — tighter than Zod's 1.8 (STATE.md: "suggested powerFraction ≤ 1.5")
  3. No more than 3 consecutive `type: "work"` blocks without a `type: "rest"` or `type: "cooldown"` between them
  4. `blocks.length ≥ 2` — minimum warmup + one work block
  Returns `{ safe: boolean; reason?: string }`. Reason is server-log only; user sees generic fallback.

### AI Prompt

- **D-05:** Use `@anthropic-ai/sdk` `messages.create()`. Model: `claude-sonnet-4-6`. System message carries `cache_control: { type: "ephemeral" }` for Anthropic prompt caching — system prompt MUST be ≥1,024 tokens to activate cache (STATE.md). Pad with coaching context detail to reach threshold.

- **D-06:** System prompt content (server-side template, never client-visible):
  - Role: "You are an expert cycling coach..."
  - Output contract: "Respond with ONLY a valid JSON object matching this schema: [embedded schema]"
  - Conservative guidance for the no-FTP case: "When FTP is absent, use conservative absolute watt targets appropriate for the stated context. Beginner: 100–150W. Returning from injury: 80–130W."
  - Interval structure guidance: warmup → work intervals → cooldown; rest blocks between high-intensity work

- **D-07:** User prompt structure — user-controlled free text is data, not instructions (PROJECT.md §AI prompt safety). Use XML delimiters:
  ```
  <user_profile>
  Goals: {goals or "Not specified"}
  FTP: {ftp + "W" or "Not set (RPE mode)"}
  Weight: {weight + "kg" or "Not set"}
  </user_profile>

  <injury_notes>
  {injuries or "None"}
  </injury_notes>

  Readiness today: {readinessScore}/3 ({label})
  Date: {ISO date}

  Generate a training session appropriate for this athlete's profile and today's readiness.
  ```
  Readiness labels: 0 = "Flat — very fatigued", 1 = "OK — some fatigue", 2 = "Good — feeling capable", 3 = "Fresh — ready to push".

### Server Action

- **D-08:** Implement generation as a Server Action `generateSessionAction(readinessScore: number)` in `src/lib/actions/session.ts` (consistent with Phase 2's `saveProfileAction` in `src/lib/actions/profile.ts`). Not a Route Handler; not streaming. Returns `{ data?: GeneratedSession; error?: string }`.

- **D-09:** Action execution order:
  1. Authenticate (read iron-session; redirect if unauthenticated)
  2. Read user profile from DB
  3. Check per-user rate limit (block if exceeded)
  4. Call Anthropic API
  5. Zod validate response
  6. Run safety gate
  7. Write session to DB (training_sessions)
  8. Return `{ data: session }`
  On any Zod/safety failure: return `{ error: "Couldn't generate a valid session. Please try again." }`.
  On API error: return `{ error: "Generation failed. Please try again in a moment." }`.

### Rate Limiting

- **D-10:** New `generationLimiter` in `src/lib/ratelimit.ts`. 10 requests per 24 hours per `userId`. Key prefix: `rl:generate:user`. Sliding window. Fail open in local dev (`UPSTASH_AVAILABLE` guard — same pattern as `ipLimiter`/`emailLimiter`).
  Error message to user: "Daily limit reached. Try again tomorrow." (GEN-03 success criterion).

### Generation UI

- **D-11:** Readiness tap-selector on the dashboard: four buttons labeled "0 — Flat", "1 — OK", "2 — Good", "3 — Fresh". Selected score highlighted. No free-text input.

- **D-12:** Dashboard shows the generator below the existing profile status line. Loading state via `useTransition` (spinner overlay on the button). On success: show a compact session summary card — title, total duration, block count. No redirect; stays on dashboard. Phase 4 builds the full Today view.

- **D-13:** Error display via existing `ErrorBanner` component (already in `src/components/ui/error-banner.tsx`).

### Error Messages (user-visible)

- Rate limit exceeded: "Daily limit reached. Try again tomorrow."
- Schema or safety gate failure: "Couldn't generate a valid session. Please try again."
- Anthropic API error / timeout: "Generation failed. Please try again in a moment."
- No message differentiation between schema and safety failures — same approach as auth's "Invalid email or password" (don't reveal technical details).

### Claude's Discretion

- Exact system prompt wording and padding to reach ≥1,024 tokens (length is required; exact prose is open)
- Anthropic SDK `maxTokens` value for the generation call (recommend 1,024–2,048)
- Exact Drizzle migration file naming and column order
- Exact tap-selector visual design (active state, spacing) within the established Tailwind/shadcn system

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Session Generation — GEN-01, GEN-02, GEN-03 are the acceptance criteria
- `.planning/ROADMAP.md` §Phase 3 — success criteria (4 items); all must be TRUE at phase end
- `.planning/PROJECT.md` §AI prompt safety — user free text as delimited data, not instructions; post-generation validation is authoritative
- `.planning/PROJECT.md` §Constraints — AI cost constraint (per-user daily rate limit to protect the bill)

### Tech Stack
- `CLAUDE.md` §AI Integration — `@anthropic-ai/sdk` 0.104.1, model `claude-sonnet-4-6`, server-side only
- `CLAUDE.md` §Validation — Zod 4.4.3 v4 breaking changes: `z.number()` bounds syntax, `error.issues` not `.errors`
- `CLAUDE.md` §Rate Limiting — `@upstash/ratelimit` 2.0.8 with Upstash Redis; fail-open in dev pattern
- `CLAUDE.md` §Critical Version Constraints — `cookies()` and `headers()` are async and must be awaited; Zod v4 API

### Existing Source Files (read before implementing)
- `src/lib/db/schema.ts` — `trainingSessions` table stub; will receive migration columns
- `src/lib/ratelimit.ts` — existing `ipLimiter`/`emailLimiter` pattern to follow for `generationLimiter`
- `src/lib/actions/profile.ts` — `saveProfileAction` Server Action pattern to follow
- `src/lib/db/queries.ts` — IDOR-safe query pattern (D-03 from Phase 1: `and()` single-call)
- `src/env.ts` — `ANTHROPIC_API_KEY` already declared; import from here only
- `src/components/ui/error-banner.tsx` — error display component for generation errors
- `.planning/STATE.md` — explicit Phase 3 notes: powerFraction bounds, system prompt caching, safety gate suggestions

### Prior Phase Decisions That Carry Forward
- Phase 1 D-03: Drizzle WHERE must use `and()` single-call pattern on all userId-scoped queries
- Phase 1 D-09: Cross-user access returns 404, not 403
- Phase 1 D-13: No secrets in client bundles — `ANTHROPIC_API_KEY` is server-side only, no `NEXT_PUBLIC_` prefix
- Phase 2 D pattern: Server Action returns `{ data? | error? }` shape; component uses `useTransition` for loading state

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/error-banner.tsx` — use for generation error display
- `src/lib/ratelimit.ts` — extend with `generationLimiter` (same UPSTASH_AVAILABLE guard pattern)
- `src/lib/actions/profile.ts` — template for Server Action structure
- `src/lib/db/queries.ts` — extend with `insertTrainingSession`, `findLatestSessionByUserId` using `and()` pattern
- `src/lib/session.ts` — session options already exported; re-use in action to read `userId`
- Tailwind/shadcn `Button`, `Card` components — use for tap-selector buttons and session summary card

### Established Patterns
- Server Action shape: `async function action(input): Promise<{data?; error?}>` — enforced by `"use server"` directive
- Drizzle `and()` single-call WHERE clause — truth-condition from Phase 1, never chain `.where().where()`
- Fail-open Upstash limiter: `UPSTASH_AVAILABLE` guard returns `PASS_THROUGH` in local dev
- Generic error messages on validation failures (never expose technical details)
- `await cookies()` — Next.js 16 async cookies; already in dashboard and profile pages

### Integration Points
- `training_sessions` table receives Phase 3 migration (adds session content columns)
- Dashboard page gains readiness tap-selector + generate button (below existing FTP status line)
- `generateSessionAction` reads profile via `findUserProfileByUserId` (already exported from queries.ts)
- Onboarding gate (Phase 2 layout.tsx `onboardingComplete` check) must complete before user can generate

</code_context>

<specifics>
## Specific Ideas

- System prompt caching: STATE.md explicitly flags that the system prompt must be ≥1,024 tokens for `cache_control` to activate. Pad with detailed coaching philosophy, interval type explanations, and schema documentation to reliably exceed this threshold.
- Safety gate powerFraction ≤ 1.5 (STATE.md "suggested") is tighter than Zod's max of 1.8. Both gates run in sequence; the safety gate catches sessions that pass Zod but exceed the physiological safety limit.
- No-FTP reference value of 150W is used only for `.zwo` export computation in Phase 4 — it is never displayed to the user as their "FTP".
- The `raw_json` column (nullable text) stores the full Claude response string for debugging in production. Do not display to user.

</specifics>

<deferred>
## Deferred Ideas

- Session preview/regeneration before committing (GEN-V2-01) — v2 requirement, explicitly out of scope
- Post-ride feedback notes feeding future context (GEN-V2-02) — v2
- Streaming generation response with Server-Sent Events — Phase 3 uses blocking Server Action; streaming is a polish concern
- Model fallback (sonnet → haiku) on timeout — not needed for v1 single-owner deployment

</deferred>

---

*Phase: 3-AI Session Generation*
*Context gathered: 2026-06-14*
