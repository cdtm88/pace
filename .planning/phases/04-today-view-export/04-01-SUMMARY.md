---
phase: 04-today-view-export
plan: "01"
subsystem: training-logic
tags: [tss, formatting, copy, server-action, redirect, tdd]
dependency_graph:
  requires: []
  provides:
    - computeTSS(blocks, ftp) — TSS estimation utility
    - computeIntensityLabel(blocks, ftp) — intensity label (Easy/Moderate/Hard)
    - formatDuration(totalSec) — shared duration formatter
    - Phase 4 COPY constants (9 keys)
    - generateSessionAction redirect to /session/{id}
  affects:
    - src/lib/actions/session.ts (success path now navigates, not returns data)
    - src/components/session/session-generator.tsx (imports shared formatDuration)
    - tests/generate-session.test.ts (updated to expect redirect)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN — tests written and committed before implementation
    - redirect() outside try/catch (Pitfall 3 compliance)
    - Weighted-average IF formula for TSS estimation (D-10)
key_files:
  created:
    - src/lib/training/tss.ts
    - src/lib/training/format.ts
    - tests/tss.test.ts
  modified:
    - src/lib/copy.ts
    - src/lib/actions/session.ts
    - src/components/session/session-generator.tsx
    - tests/generate-session.test.ts
decisions:
  - "D-10 Hard label is open-ended (>= 0.80) — 0.95 upper figure in CONTEXT.md describes expected range, not a label boundary"
  - "redirect() placed on line 189 of session.ts, after try/catch and if (!inserted) guard"
  - "generate-session.test.ts updated to mock next/navigation and assert redirect call instead of returned data"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-15"
  tasks_completed: 3
  files_changed: 7
---

# Phase 04 Plan 01: TSS Utility, Format Extraction, COPY & Redirect Summary

Pure-logic foundation for Phase 4: TSS estimation utility with full unit coverage, shared duration formatter extracted from the dashboard component, 9 Phase 4 COPY constants, and the `generateSessionAction` redirect wired to `/session/{id}` on success.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | TSS + intensity utility — failing tests | 1c66f35 | tests/tss.test.ts |
| 1 (GREEN) | computeTSS + computeIntensityLabel implementation | 80506d9 | src/lib/training/tss.ts |
| 2 | Extract shared formatDuration utility | 6c06bbe | src/lib/training/format.ts, src/components/session/session-generator.tsx |
| 3 | Phase 4 COPY keys + generateSessionAction redirect (D-02) | ff73835 | src/lib/copy.ts, src/lib/actions/session.ts, tests/generate-session.test.ts |

## Verification Results

- `npx vitest run tests/tss.test.ts` — 22 tests pass (all behavior cases per D-10)
- `npx tsc --noEmit` — no src/ errors (pre-existing errors in tests/auth.test.ts and tests/schema.test.ts are unrelated to this plan)
- `npx vitest run` — 109 tests pass (no regressions)
- `redirect(` appears at line 189 of session.ts, outside the try/catch block (Pitfall 3 compliance verified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated generate-session.test.ts to reflect new redirect contract**
- **Found during:** Task 3 verification (1 test failure after wiring redirect)
- **Issue:** The existing test `calls validateSessionSafety + DB insert and returns data for a valid SDK response` expected `result.data` to equal `mockInsertedSession`. After D-02 implementation, `generateSessionAction` throws `NEXT_REDIRECT` on success instead of returning data — the test failed with `NEXT_REDIRECT` serialized error.
- **Fix:** Added `next/navigation` mock with `mockRedirect = vi.fn()`. Updated the test to assert `mockRedirect` was called with `/session/session-uuid-123` and renamed the test to reflect the new contract.
- **Files modified:** tests/generate-session.test.ts
- **Commit:** ff73835

## Decisions Made

1. **D-10 Hard label interpretation confirmed:** The `>= 0.80` branch covers all higher intensities including values above 0.95. The "0.80–0.95" wording in CONTEXT.md D-10 describes the expected block-intensity range for typical sessions — not a label boundary. Test includes `powerFraction = 1.0` and `1.2` both asserting `"Hard"`.

2. **redirect() placement:** Call is on line 189 of session.ts, after the DB `try/catch` closes on line 180 and after the `if (!inserted)` guard on line 183. This satisfies the RESEARCH Pitfall 3 constraint: `NEXT_REDIRECT` thrown by `redirect()` cannot be caught by the DB insert error handler.

3. **Contingency not needed:** The `redirect()` approach works in the mocked test environment. The actual `useTransition` + navigation behavior is verified at the human-verify checkpoint in Plan 02.

## Known Stubs

None. This plan creates pure utilities and constants — no UI rendering with empty/placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced in this plan.

## Self-Check: PASSED

- src/lib/training/tss.ts: FOUND
- src/lib/training/format.ts: FOUND
- tests/tss.test.ts: FOUND
- Commits 1c66f35, 80506d9, 6c06bbe, ff73835: all in git log
