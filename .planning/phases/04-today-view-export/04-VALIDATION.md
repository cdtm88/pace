---
phase: 4
slug: today-view-export
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

Wave 0 note: TDD tasks in the plans create both the test file and implementation in a single task (no separate Wave 0 plan). The test file paths below match what the plans actually create under `tests/`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Created By | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-----------------|--------|
| 4-01-T1 | 04-01 | 1 | PROG-01 | — | N/A | unit (tdd) | `npx vitest run tests/tss.test.ts` | Plan 01 Task 1 | ⬜ pending |
| 4-01-T2 | 04-01 | 1 | — | — | N/A | compile | `npx tsc --noEmit` | Plan 01 Task 2 | ⬜ pending |
| 4-01-T3 | 04-01 | 1 | — | T-04-01 | redirect target uses server-side DB id; never client-supplied | compile | `npx tsc --noEmit` | Plan 01 Task 3 | ⬜ pending |
| 4-03-T1 | 04-03 | 1 | TODAY-03 | T-04-06 | XML escape prevents injection in .zwo output | unit (tdd) | `npx vitest run tests/zwo-export.test.ts` | Plan 03 Task 1 | ⬜ pending |
| 4-03-T2 | 04-03 | 1 | TODAY-03 | T-04-03, T-04-04, T-04-05 | 401 on no auth; 404 on IDOR; userId from iron-session only | compile | `npx tsc --noEmit` | Plan 03 Task 2 | ⬜ pending |
| 4-02-T1 | 04-02 | 2 | TODAY-01 | T-04-07 | IDOR 404; auth before fetch | compile | `npx tsc --noEmit` | Plan 02 Task 1 | ⬜ pending |
| 4-02-T2 | 04-02 | 2 | TODAY-01, TODAY-02, PROG-01 | T-04-08 | rawJson not forwarded to client | compile + suite | `npx tsc --noEmit && npx vitest run` | Plan 02 Task 2 | ⬜ pending |
| 4-02-T3 | 04-02 | 2 | — | — | N/A | compile + lint | `npx tsc --noEmit && npx eslint ...` | Plan 02 Task 3 | ⬜ pending |
| 4-02-T4 | 04-02 | 2 | TODAY-01, TODAY-02, TODAY-03, PROG-01 | — | IDOR 404 on foreign uuid | manual | Human-verify checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is complete: both TDD test files (`tests/tss.test.ts` and `tests/zwo-export.test.ts`) are created within their respective TDD tasks (Plan 01 Task 1 and Plan 03 Task 1) using the RED→GREEN pattern. No separate Wave 0 plan is required.

- [x] `tests/tss.test.ts` — covers PROG-01 (computeTSS + computeIntensityLabel) — created in Plan 01 Task 1
- [x] `tests/zwo-export.test.ts` — covers TODAY-03 (XML structure, XML escaping, block mapping, filename sanitization) — created in Plan 03 Task 1

*Existing vitest infrastructure covers test execution; no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Today view arm's-length legibility | TODAY-01 | Visual/perceptual, not automatable | Open /session/[id] on mobile viewport; verify watt number is large numeral and readable at ~60cm |
| .zwo file imports into Zwift | TODAY-03 | Requires Zwift client | Export .zwo; import into Zwift workouts; confirm workout appears with correct blocks |
| Zone labels display correctly | TODAY-02 | Requires FTP set in profile + visual check | Set FTP=250 in profile; generate session; verify Z1–Z7 labels per block |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are manual-only checkpoints
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered: TDD tasks create tests inline; paths match actual files under `tests/`
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
