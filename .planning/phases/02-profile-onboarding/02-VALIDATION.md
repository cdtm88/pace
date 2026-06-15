---
phase: 2
slug: profile-onboarding
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-14
audited: 2026-06-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 |
| **Config file** | `vitest.config.ts` (exists at project root) |
| **Quick run command** | `npx vitest run tests/zones.test.ts tests/profile.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/zones.test.ts tests/profile.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-schema | 01 | 0 | PROF-01 | — | Schema enforces nullable ftp/weight | unit | `npx vitest run tests/schema.test.ts` | ✅ | ✅ green |
| 02-profile-save | 01 | 1 | PROF-01 | T-02-01 | Server Action reads userId from session only | unit | `npx vitest run tests/profile-security.test.ts` | ✅ | ✅ green |
| 02-profile-upsert | 02 | 2 | PROF-02 | T-02-01 | Upsert on userId unique constraint; no duplicates | unit | `npx vitest run tests/profile-security.test.ts` | ✅ | ✅ green |
| 02-zones | 01 | 1 | PROF-03 | — | computeZones(null) returns null | unit | `npx vitest run tests/zones.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/profile.test.ts` — profileSchema validation (5 cases) + findUserProfileByUserId export
- [x] `tests/profile-security.test.ts` — PROF-01 userId-from-session contract + PROF-02 upsert idempotency (3 cases)
- [x] `tests/zones.test.ts` — covers PROF-03 (null FTP → null, computeZones(200) returns 7 zones with correct watt bounds, getZoneForWatts)
- [x] Extended `tests/schema.test.ts` — asserts new columns on `user_profiles` (ftp, weight, goals, injuries, onboarding_complete)

---

## Threat Model

`security_enforcement: true`, `security_asvs_level: 1`

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| Client-submitted userId override | Tampering (IDOR) | Server Action reads userId from iron-session only; form fields never include userId |
| Oversized text fields | Denial of Service | Zod `.max(1000)` on goals/injuries text fields |
| Unauthenticated profile write | Elevation of Privilege | `if (!session.id) redirect('/login')` at top of Server Action |
| Wizard redirect bypass | Broken Access Control | Dashboard layout redirects unboarded users; onboarding in separate non-gated route group |

---

## Validation Sign-Off

- [x] All tasks have automated verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all requirements (PROF-01, PROF-02, PROF-03)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (actual: ~530ms)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-06-15

---

## Validation Audit 2026-06-15

| Metric | Count |
|--------|-------|
| Requirements scanned | 4 tasks (PROF-01 ×2, PROF-02, PROF-03) |
| Gaps found | 2 (T-02-01 security contract, upsert idempotency) |
| Resolved | 2 (tests/profile-security.test.ts — 3 new tests) |
| Escalated to manual | 0 |
| Total automated tests | 87 (10 files) |
| Suite runtime | ~530ms |

All Phase 2 requirements (PROF-01, PROF-02, PROF-03) now have passing automated coverage. Two gaps filled by `tests/profile-security.test.ts`: userId-from-session security contract (PROF-01/T-02-01) and upsert idempotency (PROF-02/T-02-01). No implementation files modified.
