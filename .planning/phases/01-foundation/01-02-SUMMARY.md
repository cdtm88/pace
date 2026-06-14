---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [iron-session, bcryptjs, zod, upstash, ratelimit, nextjs, route-handlers]

requires:
  - phase: 01-01
    provides: Drizzle schema (users table, count()), Neon HTTP client (db), iron-session config (sessionOptions, SessionData)

provides:
  - POST /api/auth/signup — Zod v4 validated signup with bcryptjs CF12 hash and first-user bootstrap bypass (D-11)
  - POST /api/auth/login — dual-axis Upstash rate limiting (D-10) + generic anti-enumeration error (D-07)
  - POST /api/auth/logout — session.destroy() + redirect to /login (AUTH-03)
  - src/lib/ratelimit.ts — ipLimiter (10/15m) + emailLimiter (5/15m)
  - src/lib/auth/password.ts — bcryptjs CF12 hash/verify
  - src/lib/auth/schemas.ts — Zod v4 loginSchema + signupSchema

affects:
  - 01-03 (proxy.ts route protection reads session from iron-session)
  - 01-03 (auth UI pages call these endpoints)
  - All subsequent phases (auth cookie required for all protected routes)

tech-stack:
  added: []
  patterns:
    - Upstash dual-axis rate limiting — check both ipLimiter + emailLimiter; block on either failure (D-10, Pitfall 6)
    - Generic auth error — identical "Invalid email or password." string in both no-user and wrong-password branches (D-07, T-1-03)
    - First-user bootstrap — db.select({ count: count() }).from(users) === 0 bypasses SIGNUP_ENABLED gate (D-11)
    - Route handler session pattern — getIronSession<SessionData>(await cookies(), sessionOptions).save() (Next.js 16 Pitfall 3)
    - Vitest class-based mock — Ratelimit must be mocked as a class (not arrow fn) so `new Ratelimit(...)` works in module under test

key-files:
  created:
    - src/lib/ratelimit.ts
    - src/lib/auth/password.ts
    - src/lib/auth/schemas.ts
    - src/app/api/auth/signup/route.ts
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/logout/route.ts
  modified:
    - tests/auth.test.ts (stubs replaced with 15 real assertions)
    - tests/ratelimit.test.ts (stubs replaced with 9 real assertions)

key-decisions:
  - "D-05 applied: bcryptjs.hash(plain, 12) — never native bcrypt/argon2 (Vercel native binding failures)"
  - "D-07 applied: AUTH_ERROR constant 'Invalid email or password.' used in both no-user and wrong-password branches — grep count = 2"
  - "D-10 applied: Promise.all([ipLimiter.limit(ip), emailLimiter.limit(email)]) — both checked, block on either !success (Pitfall 6)"
  - "D-11 applied: count() check before SIGNUP_ENABLED gate — empty table always allowed regardless of env flag"
  - "Zod v4 patterns: z.email() not z.string().email(); result.error.issues not .errors (CLAUDE.md breaking changes)"
  - "await cookies() and await headers() everywhere — Next.js 16 async APIs (Pitfall 3)"

patterns-established:
  - "Route handler auth mutations: session.save()/session.destroy() only in Route Handlers, never in RSC"
  - "Generic error constant: define AUTH_ERROR once as a const; use the same const in all branches (prevents string drift)"
  - "Vitest mock for class constructors: use class syntax in vi.mock factory, not vi.fn().mockImplementation (arrow fn is not a constructor)"
  - "Test helper pattern: setupSelectCount(n) / setupSelectUser(user) / setupInsertUser(user) reduces mock boilerplate per test"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

duration: 7min
completed: 2026-06-14
---

# Phase 01 Plan 02: Auth Route Handlers Summary

**Signup/login/logout Route Handlers with bcryptjs CF12, dual-axis Upstash rate limiting, and iron-session httpOnly cookies — AUTH-01 through AUTH-05 all green.**

## Performance

- **Duration:** ~7 minutes (execution)
- **Started:** 2026-06-14T15:34:54Z
- **Completed:** 2026-06-14T15:40:51Z
- **Tasks:** 2 of 2 complete (TDD: 4 commits — 2 RED + 2 GREEN)
- **Files modified:** 8 files (6 created, 2 modified)

## Accomplishments

- Rate-limit module with ipLimiter (10/15m) and emailLimiter (5/15m) using Upstash sliding window (D-10)
- bcryptjs CF12 hash/verify (D-05); Zod v4 schemas with z.email() and .issues API (D-07 messages)
- Signup handler: Zod validation → first-user bypass (D-11) → bcryptjs hash → INSERT → iron-session cookie
- Login handler: dual-axis rate limit (Promise.all, block on either) → generic error (D-07) → 30-day cookie (D-06)
- Logout handler: session.destroy() + redirect to /login (AUTH-03)
- 24/24 auth tests green; 9/9 ratelimit tests green; 10/10 schema tests still green; full suite 34 passed 0 failed

## Task Commits

1. **Task 1 RED: ratelimit tests** - `04cb445` (test)
2. **Task 1 GREEN: ratelimit module + password + schemas** - `a8b6903` (feat)
3. **Task 2 RED: auth handler tests** - `5be19d9` (test)
4. **Task 2 GREEN: signup/login/logout route handlers** - `7697f40` (feat)

## Files Created/Modified

- `src/lib/ratelimit.ts` — ipLimiter slidingWindow(10, "15 m") + emailLimiter slidingWindow(5, "15 m") (D-10)
- `src/lib/auth/password.ts` — hashPassword(bcrypt.hash(plain, 12)) + verifyPassword(bcrypt.compare) (D-05)
- `src/lib/auth/schemas.ts` — loginSchema + signupSchema with z.email() (Zod v4); firstIssueMessage() helper
- `src/app/api/auth/signup/route.ts` — AUTH-01 + AUTH-05 (first-user bypass, CF12 hash, session.save)
- `src/app/api/auth/login/route.ts` — AUTH-02 + AUTH-04 (dual-axis rate limit, D-07 generic error, 30-day cookie)
- `src/app/api/auth/logout/route.ts` — AUTH-03 (session.destroy() + redirect to /login)
- `tests/auth.test.ts` — 15 real assertions replacing stubs (all 24 total pass)
- `tests/ratelimit.test.ts` — 9 real assertions replacing stubs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest class constructor mock — arrow function is not a constructor**
- **Found during:** Task 1 GREEN phase (ratelimit tests failing after implementation)
- **Issue:** `vi.fn().mockImplementation((opts) => ({ limit: mockLimit }))` cannot be used with `new Ratelimit(...)` — vitest throws "is not a constructor" because arrow functions lack `[[Construct]]`
- **Fix:** Rewrote `vi.mock("@upstash/ratelimit", ...)` factory to use `class Ratelimit { constructor(opts) {...} }` syntax so `new` works
- **Files modified:** tests/ratelimit.test.ts
- **Verification:** All 9 ratelimit tests green post-fix
- **Committed in:** a8b6903 (Task 1 GREEN commit, test file included)

**2. [Rule 1 - Bug] Test used `require("@/lib/db/index")` inside vitest ESM context**
- **Found during:** Task 2 GREEN phase (auth tests returning ERR_MODULE_NOT_FOUND)
- **Issue:** First draft of auth.test.ts used `require()` inside `beforeEach` to access the mocked db — vitest runs in ESM mode and the `@/` alias is not supported in CJS require. Module was mocked via `vi.mock("@/lib/db/index", ...)` but accessed via `require()` which bypassed the mock registry.
- **Fix:** Rewrote all test helpers to use top-level `mockDb` object (set via `vi.mock` factory) and `setupSelectCount()` / `setupSelectUser()` / `setupInsertUser()` helper functions that configure the mock state directly without require()
- **Files modified:** tests/auth.test.ts
- **Verification:** All 15 auth tests green post-fix (24 total)
- **Committed in:** 7697f40 (Task 2 GREEN commit, test file included)

**3. [Rule 1 - Bug] Login test used "correct" (7 chars) as password — below min(8)**
- **Found during:** Task 2 GREEN phase (2 login tests returning 400 instead of 200)
- **Issue:** `password: "correct"` is 7 characters; loginSchema enforces `z.string().min(8)`. The 400 was correct behavior from the schema, not a handler bug.
- **Fix:** Changed test passwords to "correctpass" (10 chars) and updated the mock hash to match: `passwordHash: "hashed:correctpass"`
- **Files modified:** tests/auth.test.ts (2 test cases)
- **Verification:** Both previously-failing tests now 200
- **Committed in:** 7697f40 (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs in test setup)
**Impact on plan:** All fixes in test infrastructure, not production code. Implementation is exactly as planned. No scope creep.

## Known Stubs

None — all 6 auth files are fully wired with real behavior. Tests cover all acceptance criteria.

## Threat Flags

No new security surface beyond the plan's threat model. All T-1-* mitigations applied:
- T-1-02: bcryptjs CF12 hash (D-05); unique email constraint catches duplicate signup (Pitfall 5)
- T-1-03: Single AUTH_ERROR const used in both no-user and wrong-password branches (D-07); bcryptjs.compare is timing-safe
- T-1-04: iron-session httpOnly + secure + sameSite=lax + 30-day maxAge (D-06); payload { id, email } only (D-04)
- T-1-05: Both ipLimiter and emailLimiter checked via Promise.all; block on either !success (D-10, Pitfall 6)
- T-1-CSRF: SameSite=Lax on all three POST handlers (D-12)
- T-1-INPUT: Zod v4 schemas on signup and login bodies (loginSchema, signupSchema)

## Next Phase Readiness

- AUTH-01 through AUTH-05 all satisfied — auth infrastructure complete
- plan 01-03 (proxy.ts + auth UI) can proceed: endpoints are live, sessionOptions is shared, cookies() is async-awaited throughout
- No blockers

---
*Phase: 01-foundation*
*Completed: 2026-06-14*
