---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

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
| schema | 01 | 1 | AUTH-01 | T-1-01 | user_id FK on all non-user tables | unit | `npx vitest run tests/schema.test.ts` | ❌ W0 | ⬜ pending |
| signup | 01 | 1 | AUTH-01 | T-1-02 | bcryptjs hash; first-user bypass | unit | `npx vitest run tests/auth.test.ts` | ❌ W0 | ⬜ pending |
| login | 01 | 2 | AUTH-02 | T-1-03 | generic error; no enumeration | unit | `npx vitest run tests/auth.test.ts` | ❌ W0 | ⬜ pending |
| session | 01 | 2 | AUTH-02 | T-1-04 | iron-session payload { id, email } | unit | `npx vitest run tests/auth.test.ts` | ❌ W0 | ⬜ pending |
| ratelimit | 02 | 2 | AUTH-04 | T-1-05 | per-IP 10/15min; per-email 5/15min | unit | `npx vitest run tests/ratelimit.test.ts` | ❌ W0 | ⬜ pending |
| idor | 01 | 3 | AUTH-05 | T-1-06 | WHERE and() on all user queries | unit | `npx vitest run tests/idor.test.ts` | ❌ W0 | ⬜ pending |
| logout | 01 | 2 | AUTH-03 | — | session destroyed; redirect to /login | manual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest config with jsdom/node environment
- [ ] `tests/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-03 (signup, login, logout, session)
- [ ] `tests/ratelimit.test.ts` — stubs for AUTH-04 (rate limiting per-IP and per-email)
- [ ] `tests/idor.test.ts` — stubs for AUTH-05 (WHERE and() pattern; cross-user 404)
- [ ] `tests/schema.test.ts` — validates all tables have user_id FK

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logout redirects to /login from any page | AUTH-03 | Requires browser session state | Sign in, navigate to /dashboard, click logout, verify redirect to /login and session cleared |
| SIGNUP_ENABLED=false blocks registration | AUTH-05 | Env var must be set to false | Set SIGNUP_ENABLED=false, attempt /signup, verify 404 or redirect |
| proxy.ts redirect for unauthenticated routes | AUTH-02 | Requires running Next.js server | Access /dashboard without session, verify redirect to /login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
