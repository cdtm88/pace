---
phase: 1
slug: foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-14
audited: 2026-06-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~550ms |

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
| schema | 01 | 1 | AUTH-01 | T-1-01 | user_id FK on all non-user tables | unit | `npx vitest run tests/schema.test.ts` | ✅ | ✅ green |
| signup | 01 | 1 | AUTH-01 | T-1-02 | bcryptjs hash; first-user bypass | unit | `npx vitest run tests/auth.test.ts` | ✅ | ✅ green |
| login | 01 | 2 | AUTH-02 | T-1-03 | generic error; no enumeration | unit | `npx vitest run tests/auth.test.ts` | ✅ | ✅ green |
| session | 01 | 2 | AUTH-02 | T-1-04 | iron-session payload { id, email } | unit | `npx vitest run tests/auth.test.ts` | ✅ | ✅ green |
| ratelimit | 02 | 2 | AUTH-04 | T-1-05 | per-IP 10/15min; per-email 5/15min | unit | `npx vitest run tests/ratelimit.test.ts` | ✅ | ✅ green |
| idor | 01 | 3 | AUTH-05 | T-1-06 | WHERE and() on all user queries | unit | `npx vitest run tests/idor.test.ts` | ✅ | ✅ green |
| logout | 01 | 2 | AUTH-03 | — | session destroyed; redirect to /login | unit | `npx vitest run tests/auth.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — vitest config with @/ path alias
- [x] `tests/auth.test.ts` — AUTH-01, AUTH-02, AUTH-03 (signup, login, logout, session) — 15 assertions
- [x] `tests/ratelimit.test.ts` — AUTH-04 (rate limiting per-IP and per-email) — 9 assertions
- [x] `tests/idor.test.ts` — AUTH-05 (WHERE and() pattern; cross-user 404) — 7 assertions
- [x] `tests/schema.test.ts` — validates all tables have user_id FK — 12 assertions

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SIGNUP_ENABLED=false blocks registration (non-empty DB) | AUTH-05 | Env var must be toggled at runtime | Set SIGNUP_ENABLED=false with existing users, attempt /signup, verify 404 |
| proxy.ts redirect for unauthenticated routes | AUTH-02 | Requires running Next.js server | Access /dashboard without session, verify redirect to /login |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-06-15

---

## Validation Audit 2026-06-15

| Metric | Count |
|--------|-------|
| Requirements scanned | 7 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated to manual | 2 |
| Total automated tests | 84 (9 files) |
| Suite runtime | ~550ms |

All Phase 1 requirements (AUTH-01–AUTH-05) have passing automated coverage.
Logout moved from Manual-Only to automated: `tests/auth.test.ts` covers `POST /api/auth/logout` with session destroy + redirect assertion.
Two items remain manual-only: `proxy.ts` redirect (requires live server) and env-flag signup gate (runtime env toggle).
