---
phase: 4
slug: today-view-export
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | TODAY-01 | — | N/A | unit | `npx vitest run src/lib/zwo.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | TODAY-03 | — | XML escape prevents injection in .zwo output | unit | `npx vitest run src/lib/zwo.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | TODAY-02 | — | N/A | unit | `npx vitest run src/lib/tss.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | PROG-01 | — | N/A | unit | `npx vitest run src/lib/tss.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | TODAY-01 | — | N/A | e2e/manual | Manual: navigate to /session/[id], verify large watt numeral visible | N/A | ⬜ pending |
| 4-04-01 | 04 | 2 | TODAY-03 | — | .zwo download triggers; file parses as valid XML | e2e/manual | Manual: click Export, open .zwo in text editor | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/zwo.test.ts` — stubs for TODAY-03 (.zwo XML generation + escaping)
- [ ] `src/lib/tss.test.ts` — stubs for TODAY-02, PROG-01 (TSS formula + intensity label)

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
