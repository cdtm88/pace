---
phase: 03-ai-session-generation
plan: "02"
subsystem: ai-session-generation
tags: [anthropic-sdk, server-action, prompt-caching, rate-limit, zod, safety-gate, tdd]
dependency_graph:
  requires:
    - 03-01 (GeneratedSessionSchema, validateSessionSafety, generationLimiter, findUserProfileByUserId, trainingSessions schema migration)
    - 01-foundation/01-03 (db, queries.ts, schema.ts)
    - 02-profile-onboarding/02-03 (SessionData, sessionOptions, findUserProfileByUserId)
  provides:
    - SYSTEM_PROMPT (≥1024-token cache-eligible cycling coach prompt, D-06)
    - buildUserPrompt (XML-delimited user prompt with readiness labels, D-07)
    - computeWattTargets (server-side D-02 dual-path watt/powerFraction computation)
    - generateSessionAction (full D-09 Server Action pipeline with both validation gates)
  affects:
    - 03-03 (SessionGenerator component calls generateSessionAction)
tech_stack:
  added:
    - "@anthropic-ai/sdk@0.104.1 (official Anthropic SDK, installed from npm)"
  patterns:
    - "Anthropic SDK system-array form with cache_control for prompt caching (RESEARCH Pattern 1)"
    - "TDD red/green cycle: test commit then implementation commit"
    - "vi.hoisted() + class-based constructor mock for Vitest v4 compatibility"
    - "XML delimiters for user free-text isolation (T-03-05 prompt injection mitigation)"
    - "Generic client-safe error messages; technical details logged server-side only (T-03-07)"
key_files:
  created:
    - src/lib/ai/prompt.ts
    - src/lib/ai/compute-watts.ts
    - src/lib/actions/session.ts
    - tests/generate-session.test.ts
  modified:
    - package.json (added @anthropic-ai/sdk@0.104.1)
    - package-lock.json
decisions:
  - "Used class-based vi.mock factory for @anthropic-ai/sdk to satisfy Vitest v4 constructor mock requirement (vi.fn().mockImplementation() pattern triggers 'did not use function or class' warning and broken new-call behavior)"
  - "No revalidatePath call in generateSessionAction — avoids Next.js 15+ useTransition/isPending bug (RESEARCH Pattern 6); UI renders from returned data"
  - "Cache usage typed as unknown cast for cache_creation_input_tokens / cache_read_input_tokens — Anthropic SDK TypeScript types do not expose these fields but they are present at runtime per prompt caching docs"
  - "userId derives from iron-session cookie only; readinessScore is the only client input to generateSessionAction"
metrics:
  duration: "18 minutes"
  completed: "2026-06-14T18:47:00Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 3 Plan 2: Anthropic SDK + Generation Pipeline Summary

One-liner: @anthropic-ai/sdk installed; cache-controlled system prompt (≥1024 tokens) with XML-delimited user free-text; server-side D-02 watt computation; generateSessionAction implementing strict D-09 order (auth → profile → rate limit → Anthropic call → Zod → safety gate → DB write → return), with mocked-SDK test suite green across all 6 behavior cases.

## What Was Built

### Task 1: SDK Install + Prompt Module + Watt Computation

**Files:** `package.json`, `package-lock.json`, `src/lib/ai/prompt.ts`, `src/lib/ai/compute-watts.ts`

**@anthropic-ai/sdk@0.104.1** installed from npm. Package Legitimacy Audit verdict (RESEARCH.md): official Anthropic SDK (anthropics/anthropic-sdk-typescript), 23.5M downloads/week, SUS-by-automation only (release recency), Approved — no human checkpoint required.

**`SYSTEM_PROMPT`** in `src/lib/ai/prompt.ts`: static server-side constant with ≥1,024 tokens of cycling coaching content. Includes: role definition, JSON-only output contract with embedded D-03 schema, explicit "No markdown. No explanation. No code fences." instruction (Pitfall 3), per-block-type coaching philosophy (warmup/work/rest/cooldown), power zone reference table by FTP fraction, conservative no-FTP watt guidance (80–150W based on context), readiness-score scaling instructions (0=recovery only to 3=full intensity). Token count comfortably exceeds the 1,024-token cache_control activation threshold for claude-sonnet-4-6.

**`buildUserPrompt(profile, readinessScore)`** wraps user-controlled fields (goals, injuries) in `<user_profile>` and `<injury_notes>` XML delimiters — treats user input as data, not instructions (T-03-05 prompt injection mitigation per PROJECT.md §AI prompt safety). Static fields (readiness score/label, date, generate instruction) are outside the delimiters.

**`READINESS_LABELS`** maps 0→"Flat — very fatigued", 1→"OK — some fatigue", 2→"Good — feeling capable", 3→"Fresh — ready to push" per D-07.

**`computeWattTargets(blocks, ftp)`** in `src/lib/ai/compute-watts.ts` implements the D-02 dual path:
- FTP present: `targetWatts = Math.round(block.powerFraction * ftp)` (Claude returns powerFraction)
- FTP absent: `powerFraction = block.targetWatts / NO_FTP_REFERENCE_WATTS` (Claude returns targetWatts)
- `NO_FTP_REFERENCE_WATTS = 150` is exported with clear documentation: internal Phase 4 .zwo export reference only — NEVER displayed to the user as their FTP (Pitfall 4).

### Task 2: generateSessionAction Server Action (TDD)

**Files:** `src/lib/actions/session.ts`, `tests/generate-session.test.ts`

**TDD RED commit:** `9ebf1de` — 6 failing test cases written before implementation.

**TDD GREEN commit:** `0473623` — implementation passes all 6 cases.

**`generateSessionAction(readinessScore: number)`** in `src/lib/actions/session.ts`:

Implements the strict D-09 execution order in a single `'use server'` Server Action:

1. **Auth**: `getIronSession(await cookies(), sessionOptions)` — returns `{ error: "Not authenticated" }` if `!session.id`. Architectural note: D-09 says "redirect" but this action is called imperatively via `useTransition`. Returning `{ error }` is the correct equivalent — the page-level auth gate (`proxy.ts` + auth layout) enforces the redirect intent before this action is reachable.

2. **Profile**: `findUserProfileByUserId(userId)` — userId from iron-session only, never from client input (T-03-04).

3. **Rate limit**: `generationLimiter.limit(userId)` — checked BEFORE the Anthropic call (Pitfall 6: keyed on userId). Blocked: `{ error: "Daily limit reached. Try again tomorrow." }` — no API spend incurred (T-03-03).

4. **Anthropic call**: `anthropic.messages.create` with `system` in array form (RESEARCH Pattern 1 — string form silently drops cache_control), `cache_control: { type: "ephemeral" }`, model `claude-sonnet-4-6`, `max_tokens: 2048`. Wrapped in try/catch → `{ error: "Generation failed. Please try again in a moment." }` on any throw. Cache token stats logged server-side only.

5. **Zod**: Strips markdown fences defensively (Pitfall 3), JSON.parse in try/catch (parse failure → generic error), `GeneratedSessionSchema.safeParse()`. Zod issues logged server-side via `zodResult.error.issues` (Zod v4 API — not `.errors`); client receives generic message (T-03-07).

6. **Safety gate**: `validateSessionSafety(zodResult.data)` runs AFTER Zod (D-09 order, Pitfall 5). Failure reason logged server-side only; client receives same generic message.

7. **DB write**: `computeWattTargets(blocks, profile?.ftp ?? null)` fills both watt fields, then `db.insert(trainingSessions).values({...}).returning()`. No `revalidatePath` call (Pattern 6: avoids useTransition/isPending hang bug). `rawJson` stored server-only, never returned.

8. **Return**: `{ data: inserted }`.

No `NEXT_PUBLIC_ANTHROPIC_API_KEY` — API key imported from `@/env` (server-only module, T-03-06).

**Test suite:** 6 behavior cases in `tests/generate-session.test.ts` using `vi.hoisted()` + class-based Anthropic mock (Vitest v4 compatible). Tests mock: `@anthropic-ai/sdk`, `next/headers`, `iron-session`, `@/lib/ratelimit`, `@/lib/db/index`, `@/lib/db/queries`, `@/env`. All 6 cases green. Full suite: 84 tests passing, 0 failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript cast errors on Anthropic usage object cache fields**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `(msg.usage as Record<string, unknown>)` raised TS2352 — `Usage` type does not overlap with `Record<string, unknown>`. The Anthropic SDK TypeScript types do not expose `cache_creation_input_tokens` / `cache_read_input_tokens` even though they are present at runtime per the prompt caching docs.
- **Fix:** Changed to `const usage = msg.usage as unknown as Record<string, unknown>` (double cast through unknown — safe because this is server-side logging only, never user-facing).
- **Files modified:** `src/lib/actions/session.ts`
- **Commit:** f3cb479

**2. [Rule 1 - Bug] Vitest v4 constructor mock incompatibility with vi.fn().mockImplementation()**
- **Found during:** Task 2 GREEN phase (3 of 6 tests returning "Generation failed" despite `mockResolvedValue` being set)
- **Issue:** In Vitest v4, using `vi.fn().mockImplementation(() => ({...}))` as a constructor mock (called with `new`) does not reliably return the implementation object — the warning "vi.fn() mock did not use 'function' or 'class'" surfaces, and the constructor returns undefined/broken state. This caused `anthropic.messages.create` to throw rather than resolve.
- **Fix:** Replaced `vi.fn().mockImplementation(...)` with a `class MockAnthropic` having `messages = { create: mockMessagesCreate }` as a class property. Class-based mocks work correctly with `new` in Vitest v4.
- **Files modified:** `tests/generate-session.test.ts`
- **Commit:** 0473623

## Known Stubs

None. All implementations are complete:
- `SYSTEM_PROMPT` is the full production prompt (≥1024 tokens, not a placeholder).
- `buildUserPrompt` returns the complete D-07 template with XML delimiters.
- `computeWattTargets` implements the full D-02 dual path.
- `generateSessionAction` implements the full D-09 pipeline with both validation gates.
- Tests mock the SDK/DB for unit isolation; they test real action logic against real Zod schema and safety gate.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model explicitly specifies. All mitigations from the threat register applied:

| Threat ID | Status |
|-----------|--------|
| T-03-05 (prompt injection via user free-text) | Mitigated — XML delimiters in buildUserPrompt; SYSTEM_PROMPT is static server constant, never receives user input |
| T-03-01 (AI output → DB without validation) | Mitigated — GeneratedSessionSchema.safeParse before any DB write |
| T-03-02 (unsafe session bypass) | Mitigated — validateSessionSafety after Zod, before insert |
| T-03-03 (runaway AI spend) | Mitigated — generationLimiter.limit(userId) BEFORE Anthropic call |
| T-03-06 (ANTHROPIC_API_KEY in client bundle) | Mitigated — imported from @/env ('use server' module), no NEXT_PUBLIC_ prefix |
| T-03-07 (error/rawJson leakage to client) | Mitigated — Zod issues + safety reason logged server-side; client sees generic messages only; rawJson never returned |
| T-03-04 (cross-user profile read) | Mitigated — findUserProfileByUserId(userId) uses cookie userId only |
| T-03-SC (npm install @anthropic-ai/sdk) | Accepted — official Anthropic package, RESEARCH.md audit Approved |

## TDD Gate Compliance

- RED gate: `test(03-02)` commit exists at 9ebf1de
- GREEN gate: `feat(03-02)` commit exists at 0473623
- REFACTOR gate: TypeScript fix committed at f3cb479 (not a behavioral refactor, but a bug fix; tests remained green throughout)

## Self-Check: PASSED

All 4 created/modified source files confirmed on disk. All 4 task commits verified.
