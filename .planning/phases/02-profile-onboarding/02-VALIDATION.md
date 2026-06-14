---
phase: 2
slug: profile-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
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
| 02-schema | 01 | 0 | PROF-01 | — | Schema enforces nullable ftp/weight | unit | `npx vitest run tests/schema.test.ts` | ✅ (extend) | ⬜ pending |
| 02-profile-save | 01 | 1 | PROF-01 | T-02-01 | Server Action reads userId from session only | unit | `npx vitest run tests/profile.test.ts` | ❌ W0 | ⬜ pending |
| 02-profile-upsert | 02 | 2 | PROF-02 | T-02-01 | Upsert on userId unique constraint; no duplicates | unit | `npx vitest run tests/profile.test.ts` | ❌ W0 | ⬜ pending |
| 02-zones | 01 | 1 | PROF-03 | — | computeZones(null) returns null | unit | `npx vitest run tests/zones.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/profile.test.ts` — covers PROF-01 (schema columns added) and PROF-02 (upsert creates/updates without duplicate)
- [ ] `tests/zones.test.ts` — covers PROF-03 (null FTP → null, computeZones(200) returns 7 zones with correct watt bounds)
- [ ] Extend `tests/schema.test.ts` — assert new columns exist on `user_profiles` (ftp, weight, goals, injuries, onboarding_complete)

---

## Threat Model

`security_enforcement: true`, `security_asvs_level: 1`

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| Client-submitted userId override | Tampering (IDOR) | Server Action reads userId from iron-session only; form fields never include userId |
| Oversized text fields | Denial of Service | Zod `.max(1000)` on goals/injuries text fields |
| Unauthenticated profile write | Elevation of Privilege | `if (!session.id) redirect('/login')` at top of Server Action |
| Wizard redirect bypass | Broken Access Control | Dashboard layout redirects unboarded users; onboarding in separate non-gated route group |
