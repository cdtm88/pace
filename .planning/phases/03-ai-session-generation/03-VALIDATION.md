---
phase: 03
slug: ai-session-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (or none — Wave 0 installs if missing) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

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
| 03-01-01 | 01 | 0 | GEN-01 | — | N/A | unit | `npx vitest run src/lib/db/schemas/session.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | GEN-01 | — | N/A | integration | `npx vitest run src/lib/db/migrations` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | GEN-02 | T-03-01 | Malformed AI output rejected before DB write | unit | `npx vitest run src/lib/ai/session-schema.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | GEN-02 | T-03-02 | powerFraction outside [0.1,1.8] rejected | unit | `npx vitest run src/lib/ai/safety-gate.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | GEN-03 | T-03-03 | Rate limit blocks AI call when daily limit hit | unit | `npx vitest run src/lib/ratelimit.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | GEN-01 | — | N/A | unit | `npx vitest run src/lib/ai/generate-session.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 3 | GEN-01 | — | N/A | manual | see Manual Verifications | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/db/schemas/session.test.ts` — stubs for GEN-01 (Zod schema validation)
- [ ] `src/lib/ai/safety-gate.test.ts` — stubs for GEN-02 (safety gate powerFraction bounds)
- [ ] `src/lib/ai/session-schema.test.ts` — stubs for GEN-02 (malformed output rejection)
- [ ] `src/lib/ratelimit.test.ts` — stubs for GEN-03 (daily rate limit)
- [ ] `src/lib/ai/generate-session.test.ts` — stubs for GEN-01 (generateSessionAction)
- [ ] vitest installed and runnable (`npx vitest run` exits 0)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tap-selector renders (0–3) + triggers generation | GEN-01 | UI interaction | Open dashboard, tap each readiness score, confirm session card appears |
| Visible fallback message on validation failure | GEN-02 | UI state | Force a bad AI response in test env, confirm error UI renders |
| "Limit reached" message instead of AI call | GEN-03 | UI state | Exhaust daily limit, confirm message shown without API call |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
