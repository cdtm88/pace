---
phase: 03-ai-session-generation
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/lib/db/schemas/session.ts
  - src/lib/safety-gate.ts
  - tests/session-schema.test.ts
  - tests/safety-gate.test.ts
  - src/lib/ratelimit.ts
  - src/lib/db/queries.ts
  - src/lib/db/schema.ts
  - tests/ratelimit.test.ts
  - src/lib/ai/prompt.ts
  - src/lib/ai/compute-watts.ts
  - src/lib/actions/session.ts
  - tests/generate-session.test.ts
  - src/components/session/session-generator.tsx
  - src/app/(app)/dashboard/page.tsx
findings:
  critical: 3
  warning: 3
  info: 3
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 3 adds AI session generation: Anthropic API call, dual-gate validation (Zod + safety gate), rate limiting, watt computation, a server action, and dashboard UI. The security posture is generally sound — userId is read from iron-session, the API key is server-only, and generic errors are surfaced to users. Three critical defects were found: the server action returns the full DB row including `rawJson` (raw Anthropic response text) to the client; `ANTHROPIC_API_KEY` and `SESSION_SECRET` are typed `string | undefined` and passed without null-guard to the SDK and iron-session respectively; and `readinessScore` is not validated before being written to the DB or injected into the AI prompt. Three warnings cover a `totalDurationSec` consistency gap, `warmup` blocks not resetting the consecutive-work counter (allowing a covert safety bypass), and the ratelimit test that checks the "Too many attempts" string constant against itself without verifying it matches the actual route handler message.

## Critical Issues

### CR-01: Full DB row including `rawJson` returned to client

**File:** `src/lib/actions/session.ts:149-165`

**Issue:** `db.insert(...).returning()` returns every column of the inserted row, including `rawJson: text("raw_json")` which contains the raw Anthropic API response. The action returns `{ data: inserted }` directly to the client component (`session-generator.tsx`). The comment on line 160 says "stored server-only for debugging; never returned to client" — this is false: `.returning()` with no column list returns all columns, and the whole object is shipped to the browser.

In addition to leaking internal AI response text, this sends the full `blocks` JSONB blob, `readinessScore`, and every other column to an untrusted client when only `title`, `totalDurationSec`, and `blocks` are consumed in the UI.

**Fix:** Project only the columns needed for the UI response, or strip `rawJson` before returning:

```typescript
// Option A — select only what the UI needs:
const [inserted] = await db
  .insert(trainingSessions)
  .values({ ... })
  .returning({
    id: trainingSessions.id,
    title: trainingSessions.title,
    totalDurationSec: trainingSessions.totalDurationSec,
    blocks: trainingSessions.blocks,
    notes: trainingSessions.notes,
    readinessScore: trainingSessions.readinessScore,
    createdAt: trainingSessions.createdAt,
  })

// Option B — strip before returning:
const { rawJson: _raw, ...safeInserted } = inserted
return { data: safeInserted }
```

---

### CR-02: `ANTHROPIC_API_KEY` is `string | undefined` — undefined crashes the Anthropic SDK silently or produces misleading auth errors

**File:** `src/env.ts:33` / `src/lib/actions/session.ts:74`

**Issue:** `ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY` is typed `string | undefined`. When the env var is absent the Anthropic SDK receives `undefined` as `apiKey`. The SDK constructor accepts `string | undefined` and falls back to its own `ANTHROPIC_API_KEY` env lookup, so the call may succeed in development but fail in production in a way that is hard to trace. There is no startup guard. The same applies to `SESSION_SECRET` in `src/lib/session.ts:33` where `process.env.SESSION_SECRET as string` papers over the `undefined` with a type cast — if the var is absent iron-session will encrypt cookies with an empty string, making sessions trivially forgeable.

**Fix:** Validate required secrets at import time and throw an explicit error:

```typescript
// src/env.ts
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const ANTHROPIC_API_KEY = requireEnv('ANTHROPIC_API_KEY');
export const SESSION_SECRET = requireEnv('SESSION_SECRET');
// ... etc.
```

For `SESSION_SECRET` in `session.ts`, remove the `as string` cast and import from `@/env` instead of reading `process.env` directly.

---

### CR-03: `readinessScore` is not validated before DB write or AI prompt injection

**File:** `src/lib/actions/session.ts:51-92`

**Issue:** `generateSessionAction(readinessScore: number)` is a Server Action callable from any client. The `readinessScore` parameter is written directly to `trainingSessions.readinessScore` (line 155) and injected into the AI user prompt via `buildUserPrompt(profile, readinessScore)` (line 92) without any bounds or integer check. A malicious caller can pass `-999`, `999`, `1.5`, or `NaN`. Consequences:

1. An out-of-range integer is persisted to the `readiness_score integer` column without error (Postgres accepts any integer).
2. `READINESS_LABELS[readinessScore]` returns `undefined` for any value outside `{0,1,2,3}`, falling back to `"Unknown"` — but the raw number (e.g. `-999`) is still injected into the prompt as `Readiness today: -999/3 (Unknown)`, which could skew session generation and represents unvalidated user input reaching the LLM prompt.

**Fix:** Validate at the top of the action before any work:

```typescript
import { z } from 'zod'

const readinessScoreSchema = z.number().int().min(0).max(3)

export async function generateSessionAction(readinessScore: number) {
  const parsedReadiness = readinessScoreSchema.safeParse(readinessScore)
  if (!parsedReadiness.success) {
    return { error: 'Invalid readiness score.' }
  }
  // use parsedReadiness.data from here on
```

---

## Warnings

### WR-01: `totalDurationSec` is AI-asserted and not verified against the actual sum of block durations

**File:** `src/lib/safety-gate.ts:20` / `src/lib/actions/session.ts:159`

**Issue:** The safety gate checks `session.totalDurationSec > 14400` but never computes `blocks.reduce((s, b) => s + b.durationSec, 0)` and compares it to `totalDurationSec`. The AI can assert `totalDurationSec: 2700` while the blocks actually sum to 10,800 seconds (or vice versa). The wrong duration is then stored in the DB and displayed to the user in the UI summary card. There is no Zod constraint enforcing consistency either. This is an agreed defense-in-depth gap.

**Fix:** Add a fifth safety-gate check:

```typescript
// Check 5: totalDurationSec must match actual sum of block durations
const blockSum = session.blocks.reduce((sum, b) => sum + b.durationSec, 0)
if (blockSum !== session.totalDurationSec) {
  return {
    safe: false,
    reason: `totalDurationSec ${session.totalDurationSec} does not match block sum ${blockSum}`,
  }
}
```

---

### WR-02: `warmup` blocks do not reset the consecutive-work counter — a session starting with work blocks after an initial warmup can accumulate 4+ consecutive work-adjacent intervals

**File:** `src/lib/safety-gate.ts:46-61`

**Issue:** The comment on line 60 says "warmup only appears at session start" and deliberately skips resetting `consecutiveWorkCount` for warmup. However the Zod schema does not enforce that warmup blocks can only appear first — `type: z.enum(["warmup", "work", "rest", "cooldown"])` is free on every block. If the AI generates `work, warmup, work, work, work` (an unconventional but schema-valid sequence), the `warmup` in position 2 does not reset the counter, so blocks 1 + 3 + 4 + 5 would accumulate 4 consecutive work-category intervals without triggering the gate. More practically, if the AI hallucinates a warmup mid-session the safety check silently ignores it.

Additionally, the current logic means `warmup, work, work, work, work` passes the gate (counter starts at 0 after warmup is skipped; then hits 4 work blocks — counter reaches 4 which is `> 3`, so it does fail). However, if there were two warmup blocks sandwiching something, the logic is unintuitive. The safest fix is to treat `warmup` the same as `rest`/`cooldown` for counter reset purposes since an intervening warmup block does break up the work load.

**Fix:**

```typescript
} else if (block.type === "rest" || block.type === "cooldown" || block.type === "warmup") {
  consecutiveWorkCount = 0;
}
```

---

### WR-03: Ratelimit test "D-10 no timing info" asserts a constant against itself — no coverage of the actual route handler message

**File:** `tests/ratelimit.test.ts:84-88`

**Issue:** The test at line 84 titled "returns generic 'Too many attempts' message with no timing info on 429 (D-10)" does the following:

```typescript
const MESSAGE = "Too many attempts. Try again in a few minutes.";
expect(MESSAGE).toBe("Too many attempts. Try again in a few minutes.");
```

This asserts a local variable equals itself. It will always pass regardless of what the actual login route handler returns. There is no reference to the real route handler string, no import, and no assertion against the source-of-truth. If the route handler changes its message this test will not catch the regression.

**Fix:** Extract the 429 message string to a shared constant importable from both the route handler and the test, then assert the import:

```typescript
// src/lib/copy.ts or src/lib/errors.ts
export const RATE_LIMIT_MESSAGE = "Too many attempts. Try again in a few minutes."

// tests/ratelimit.test.ts
import { RATE_LIMIT_MESSAGE } from "@/lib/errors"
// ... in the test body:
expect(actualRouteResponse.body.error).toBe(RATE_LIMIT_MESSAGE)
```

---

## Info

### IN-01: `GeneratedSession` type imported but only used for a cast in session-generator — `unknown` blocks type widens the safety

**File:** `src/components/session/session-generator.tsx:33,157`

**Issue:** `GeneratedSession` is imported for the sole purpose of the cast `sessionData.blocks as GeneratedSession["blocks"]` on line 157. The `SessionSummary` type on line 39 declares `blocks: unknown`, so the cast provides no runtime safety — if the JSONB column ever returns something unexpected, `.length` will throw at runtime.

**Fix:** Either narrow the type properly using `Array.isArray` (already done) and avoid the cast, or define `blocks` in `SessionSummary` as `GeneratedSession["blocks"] | unknown[]` to avoid the unsafe cast. The `GeneratedSession` import from a server-only schema module should be verified that it does not pull server-only code into the client bundle (tree-shaking should handle this since only the type is used, but confirm with a bundle analysis in CI).

---

### IN-02: `console.log` left in production path for cache stats

**File:** `src/lib/actions/session.ts:100-106`

**Issue:** Token usage including `cacheCreationInputTokens` and `cacheReadInputTokens` is logged via `console.log` on every successful generation call. While intentional for debugging, this logs on every production request and may expose spend patterns to anyone with Vercel log access. At minimum it should use a structured logger or be gated on `process.env.NODE_ENV !== 'production'`.

**Fix:**

```typescript
if (process.env.NODE_ENV !== 'production' && msg.usage) {
  // ... console.log(...)
}
```

Or use a structured logging library with appropriate log levels.

---

### IN-03: `READINESS_LABELS` exported as a plain `Record<number, string>` — safe but fragile for out-of-range keys

**File:** `src/lib/ai/prompt.ts:28-33`

**Issue:** `READINESS_LABELS` has keys `0–3`. The `?? "Unknown"` fallback in `buildUserPrompt` on line 183 handles missing keys, but the type `Record<number, string>` implies any `number` key is present (TypeScript will not warn on `READINESS_LABELS[99]`). Combined with the missing `readinessScore` validation (CR-03), this is a contributing factor to silent fallback behavior. Low severity on its own but worth tightening.

**Fix:** Type the key as a union literal:

```typescript
export const READINESS_LABELS: Record<0 | 1 | 2 | 3, string> = { ... }
```

This makes TypeScript warn when an out-of-range number is used as a key.

---

_Reviewed: 2026-06-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
