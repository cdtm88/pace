---
phase: 03
slug: ai-session-generation
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-14
audited: 2026-06-15
---

# Phase 03 — Validation Strategy

> Per-phase validation contract — audited post-execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~530ms (84 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | GEN-02 | T-03-01 | Malformed AI output (missing fields, out-of-bounds powerFraction) rejected before DB write | unit | `npx vitest run tests/session-schema.test.ts` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | GEN-02 | T-03-02 | powerFraction > 1.5, >3 consecutive work blocks, <2 blocks, >4h total all rejected by safety gate | unit | `npx vitest run tests/safety-gate.test.ts` | ✅ | ✅ green |
| 03-01-03 | 01 | 1 | GEN-03 | T-03-03 | generationLimiter 10/24h sliding window keyed on userId blocks before Anthropic call | unit | `npx vitest run tests/ratelimit.test.ts` | ✅ | ✅ green |
| 03-01-04 | 01 | 1 | GEN-01 | — | Migration 0002 applied: training_sessions has 6 D-01 columns (title, notes, readinessScore, blocks, totalDurationSec, rawJson) | manual | see Manual-Only | — | ✅ verified |
| 03-02-01 | 02 | 2 | GEN-01 | T-03-01, T-03-02, T-03-03, T-03-05, T-03-06, T-03-07 | Full D-09 pipeline (auth → profile → rate-limit → Anthropic → Zod → safety gate → DB) returns data or generic error; rawJson never returned | unit | `npx vitest run tests/generate-session.test.ts` | ✅ | ✅ green |
| 03-03-01 | 03 | 3 | GEN-01 | T-03-07, T-03-08 | Tap-selector (0–3), generate button, success card, ErrorBanner — all three error paths surfaced without technical detail | manual | see Manual-Only | — | ✅ verified |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test stubs created and green (tests live in `tests/` not `src/lib/`):

- [x] `tests/session-schema.test.ts` — GEN-02 Zod schema validation (10 cases)
- [x] `tests/safety-gate.test.ts` — GEN-02 physiological safety gate (6 cases)
- [x] `tests/ratelimit.test.ts` — GEN-03 per-user generation limit (3 cases + 9 auth cases)
- [x] `tests/generate-session.test.ts` — GEN-01 generateSessionAction D-09 pipeline (6 cases)
- [x] vitest installed and runnable — 84 tests, 528ms, 0 failures

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Result |
|----------|-------------|------------|--------|
| Migration 0002 applied — training_sessions has 6 D-01 columns | GEN-01 | Drizzle migration applied once to live Neon DB; no meaningful unit test retroactively possible | ✅ verified — `drizzle-kit migrate` output confirmed; no pending migrations remain |
| Tap-selector renders (0–3) + triggers generation | GEN-01 | UI interaction | ✅ UAT passed — 6/7 cases passed (1 skipped) |
| Visible fallback message on validation failure | GEN-02 | UI state | ✅ UAT passed — "Couldn't generate a valid session" shown |
| "Daily limit reached" message instead of AI call | GEN-03 | UI state | ✅ UAT passed (note: verified during API key debugging) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual-only justification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 20s (actual: 528ms)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-06-15

---

## Validation Audit 2026-06-15

| Metric | Count |
|--------|-------|
| Tasks audited | 6 |
| COVERED (automated) | 4 |
| MANUAL VERIFIED | 2 |
| Gaps found | 1 (migration — inherently manual) |
| Resolved | 0 new tests needed |
| Escalated to manual-only | 1 (03-01-04 migration) |

**Note:** VALIDATION.md was drafted pre-execution with wrong test paths (`src/lib/...`) and a 5-plan task structure. Updated to reflect actual 3-plan execution with tests in `tests/` directory. All 84 tests pass; UAT complete 6/7.
