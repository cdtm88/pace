---
phase: 01-foundation
plan: 03
subsystem: auth-ui
tags: [proxy, idor, iron-session, shadcn, dark-zinc, login, signup, route-protection, drizzle]

requires:
  - phase: 01-01
    provides: Drizzle schema (4 tables), Neon HTTP client, iron-session config
  - phase: 01-02
    provides: POST /api/auth/login, /api/auth/signup, /api/auth/logout route handlers

provides:
  - proxy.ts at project root — blanket auth redirect via getIronSession(request.cookies, sessionOptions) (D-08)
  - src/lib/db/queries.ts — findTrainingSession, findUserProfile, findStravaConnection with single and() WHERE clause (D-03 IDOR truth-condition); all return null for 404-not-403 (D-09)
  - src/app/(app)/layout.tsx — RSC layout reads session via getIronSession(await cookies()); redirects to /login
  - src/app/(app)/dashboard/page.tsx — displays session.email + logout POST form (AUTH-02, AUTH-03)
  - src/app/(auth)/login/page.tsx — dark zinc auth screen; SIGNUP_ENABLED controls signup link
  - src/app/(auth)/signup/page.tsx — gated by SIGNUP_ENABLED + first-user count check (D-11); notFound() when closed
  - src/components/auth/* — AuthCard (wordmark + zinc-900 card), LoginForm, SignupForm (client components)
  - src/components/ui/error-banner.tsx — role="alert" page-level error display
  - src/lib/copy.ts — single-sourced copywriting contract; all UI-SPEC strings (D-07/D-10/D-11 verbatim)
  - Green tests/idor.test.ts — 7 assertions verifying cross-user returns null + single db.select() per query

affects:
  - All subsequent phases (proxy.ts protects all routes; query helpers are the IDOR pattern foundation)
  - Phase 2 (profile page will live in (app) route group, protected by this layout)
  - Phase 3+ (all user-scoped DB access should use the and() helpers from queries.ts)

tech-stack:
  added:
    - shadcn input, label, card components (base-nova style, @base-ui/react)
  patterns:
    - proxy.ts (not middleware.ts) blanket redirect — getIronSession(request.cookies, sessionOptions); no cookie-header fallback
    - IDOR-safe query helpers — single and(eq(table.userId), eq(table.id)) in one .where() call; return null → notFound() → 404
    - (app) RSC layout session read — getIronSession(await cookies(), sessionOptions); never session.save() in RSC
    - lazy db client — Proxy wrapper defers neon() call to first use (prevents build-time Turbopack worker failures)
    - error-banner role="alert" pattern for page-level auth errors
    - copy.ts single-source for all UI strings — prevents D-07 string drift across auth components

key-files:
  created:
    - proxy.ts
    - src/lib/db/queries.ts
    - src/app/(app)/layout.tsx
    - src/app/(app)/dashboard/page.tsx
    - src/app/(auth)/login/page.tsx
    - src/app/(auth)/signup/page.tsx
    - src/components/auth/auth-card.tsx
    - src/components/auth/login-form.tsx
    - src/components/auth/signup-form.tsx
    - src/components/ui/error-banner.tsx
    - src/components/ui/card.tsx
    - src/components/ui/input.tsx
    - src/components/ui/label.tsx
    - src/lib/copy.ts
  modified:
    - tests/idor.test.ts (stubs → 7 real assertions, all green)
    - src/lib/db/index.ts (lazy Neon init via Proxy — Rule 3 fix)
    - proxy.ts (IronCookieStore type cast for NextRequest compat — Rule 1 fix)
    - src/lib/auth/schemas.ts (SafeParseError → ZodSafeParseError — Rule 1 fix)
    - src/app/api/auth/signup/route.ts (Error cast for TS strict mode — Rule 1 fix)

key-decisions:
  - "D-08 applied: proxy.ts at project root (not middleware.ts); getIronSession(request.cookies, sessionOptions); PUBLIC_PATHS includes /login, /signup, /api/auth/*"
  - "D-03 applied: all query helpers use single and() WHERE call; comment 'IDOR guard: and() is mandatory here — do not split into chained .where() calls' present in queries.ts"
  - "D-09 applied: all query helpers return null on no-match; callers use notFound() → 404, never 403"
  - "D-11 applied: signup/page.tsx server-side COUNT check; notFound() when SIGNUP_ENABLED=false AND userCount > 0; first-user bypass when userCount === 0"
  - "Deviation: lazy db client via Proxy — defers neon() to first request, prevents Turbopack build-time worker failure when DATABASE_URL not in worker env"
  - "IronCookieStore inline interface cast — NextRequest.cookies.set() overload incompatible with iron-session CookieStore; cast safe (proxy.ts only reads, never writes session)"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05]

duration: ~20min
completed: 2026-06-14
---

# Phase 01 Plan 03: Route Protection + IDOR Queries + Auth UI Summary

**proxy.ts blanket redirect, IDOR-safe query helpers (D-03 truth-condition tested), dark zinc login/signup screens per UI-SPEC, and browser-verified end-to-end auth loop — all 3 tasks complete.**

## Performance

- **Duration:** ~20 minutes
- **Started:** ~2026-06-14T15:40:00Z
- **Completed:** 2026-06-14T16:30:00Z
- **Tasks:** 3 of 3 complete
- **Files created/modified:** 19 files

## Accomplishments

- proxy.ts at project root (not middleware.ts, D-08): blanket redirect to /login for unauthenticated requests; reads session from request.cookies via iron-session v8 with no cookie-header fallback; PUBLIC_PATHS includes all auth routes
- src/lib/db/queries.ts: 3 user-scoped query helpers (findTrainingSession, findUserProfile, findStravaConnection) all using single `and(eq(table.userId), eq(table.id))` WHERE call; D-03 IDOR truth-condition comment present; return null → callers use notFound() → 404 not 403 (D-09)
- tests/idor.test.ts: 7 tests green — cross-user returns null, own-user returns row, single db.select per query; no chained .where() possible
- (app)/layout.tsx: RSC layout reads session via getIronSession(await cookies()); redirects to /login
- (app)/dashboard/page.tsx: displays session.email; logout POST form to /api/auth/logout (AUTH-02, AUTH-03)
- Auth UI: AuthCard (zinc-950 page bg, zinc-900 card, "Pace" wordmark 28px/700), LoginForm (email inputmode/autocomplete, password current-password, 48px/16px inputs, Loader2 loading state), SignupForm (confirm new-password autocomplete, password mismatch inline error)
- copy.ts: all UI-SPEC copywriting contract strings; "Invalid email or password", "Too many attempts. Try again in a few minutes.", "Registration is not open." verbatim
- Full test suite: 41/41 pass; npm run build exits 0

## Task Commits

1. **Task 1: proxy.ts + IDOR-safe queries + protected layout** — `399ab84` (feat)
2. **Task 2: Login/signup UI + copy.ts + error-banner** — `83f7c78` (feat)
3. **Task 3: checkpoint:human-verify** — VERIFIED (2026-06-14): /login zinc-950 bg + zinc-900 card renders correctly; /signup 3-field form renders correctly; /dashboard unauthenticated → redirects to /login (proxy.ts working); signup with christianmoore88@gmail.com → /dashboard shows email + Sign out button; 41/41 vitest tests pass

## Files Created/Modified

### Created
- `proxy.ts` — blanket auth redirect (D-08); getIronSession(request.cookies, sessionOptions)
- `src/lib/db/queries.ts` — IDOR-safe query helpers; single and() per query; null → 404 (D-03, D-09)
- `src/app/(app)/layout.tsx` — RSC layout reading session; redirect on no session.id
- `src/app/(app)/dashboard/page.tsx` — session.email display + logout form
- `src/app/(auth)/login/page.tsx` — login screen (server component, SIGNUP_ENABLED → link)
- `src/app/(auth)/signup/page.tsx` — signup screen gated by D-11; notFound() when closed
- `src/components/auth/auth-card.tsx` — AuthCard layout (wordmark + card)
- `src/components/auth/login-form.tsx` — LoginForm client component
- `src/components/auth/signup-form.tsx` — SignupForm client component
- `src/components/ui/error-banner.tsx` — role="alert" page-level error
- `src/components/ui/card.tsx` — shadcn card (base-nova)
- `src/components/ui/input.tsx` — shadcn input (base-nova)
- `src/components/ui/label.tsx` — shadcn label (base-nova)
- `src/lib/copy.ts` — copywriting contract single-source

### Modified
- `tests/idor.test.ts` — 5 stubs → 7 real assertions (all green)
- `src/lib/db/index.ts` — lazy Neon client init (Rule 3 fix: build compatibility)
- `proxy.ts` — IronCookieStore type cast (Rule 1 fix: TS type compat)
- `src/lib/auth/schemas.ts` — ZodSafeParseError (Rule 1 fix: Zod v4 type rename)
- `src/app/api/auth/signup/route.ts` — Error cast fix (Rule 1 fix: TS strict mode)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Neon module-level initialization fails at build time**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** `neon(process.env.DATABASE_URL!)` called at module evaluation time in `src/lib/db/index.ts`. Turbopack's page-data collection workers run in a subprocess that doesn't inherit DATABASE_URL. Build exits 1 with "No database connection string was provided to `neon()`."
- **Fix:** Wrapped db in a Proxy that defers `neon()` call to first property access (first actual query at request time). At runtime, DATABASE_URL is always available. At build time, the module loads without error.
- **Files modified:** `src/lib/db/index.ts`
- **Impact:** Zero behavioral change — the Neon client is still created once and reused. Drizzle type inference via the Proxy required `as unknown as` cast.

**2. [Rule 1 - Bug] NextRequest.cookies incompatible with iron-session CookieStore type**
- **Found during:** Task 2 verification (`npm run build` TypeScript check)
- **Issue:** `getIronSession<SessionData>(request.cookies, sessionOptions)` — TypeScript rejects `request.cookies` (NextRequest's `RequestCookies`) because its `.set()` overload signature differs from iron-session's `CookieStore.set()`.
- **Fix:** Added inline `IronCookieStore` interface matching iron-session's expected shape and cast `request.cookies as unknown as IronCookieStore`. Safe: proxy.ts only reads the session, never writes it (no `.set()` called at runtime).
- **Files modified:** `proxy.ts`

**3. [Rule 1 - Bug] Zod v4 renamed SafeParseError to ZodSafeParseError**
- **Found during:** Task 2 verification (`npm run build` TypeScript check)
- **Issue:** `firstIssueMessage(result: z.SafeParseError<unknown>)` — TypeScript error "has no exported member named 'SafeParseError'. Did you mean 'ZodSafeParseError'?"
- **Fix:** Updated type annotation to `z.ZodSafeParseError<unknown>` (Zod v4 renamed the type).
- **Files modified:** `src/lib/auth/schemas.ts`

**4. [Rule 1 - Bug] Error cast in signup route handler**
- **Found during:** Task 2 verification (`npm run build` TypeScript check)
- **Issue:** `(err as Record<string, unknown>)["code"]` — TypeScript rejects casting `Error` to `Record<string, unknown>` without double-assertion.
- **Fix:** Changed to `(err as unknown as Record<string, unknown>)["code"]`.
- **Files modified:** `src/app/api/auth/signup/route.ts`

## Checkpoint Verification — COMPLETE

**Task 3 (checkpoint:human-verify):** Browser verification confirmed 2026-06-14:
- /login: zinc-950 background, zinc-900 card, white CTA — matches UI-SPEC
- /signup: 3-field form renders correctly
- /dashboard unauthenticated: redirects to /login — proxy.ts working
- Signup with christianmoore88@gmail.com: lands on /dashboard showing email + Sign out button
- All 41 vitest tests pass

## Known Stubs

None. All query helpers are real implementations (no mock data). All auth components fetch real endpoints.

## Threat Flags

No new security surface beyond the plan's threat model. All T-1-* mitigations applied:
- T-1-06 (IDOR): and() single-call pattern in all query helpers; tested in idor.test.ts (7/7 green)
- T-1-IDOR-404: findTrainingSession/findUserProfile/findStravaConnection return null; callers use notFound() → 404
- T-1-PROXY: proxy.ts (not middleware.ts); getIronSession(request.cookies, sessionOptions); blanket redirect for non-public paths
- T-1-XSS: CSP header from Plan 01 (D-13); React escapes interpolated copy; error strings from copy.ts constants
- T-1-UI-ENUM: signup notFound() when disabled + user exists; login error "Invalid email or password" from copy.ts AUTH_ERROR_INVALID constant

## Self-Check: PASSED

Files confirmed present on disk:
- /Users/christianmoore/ai/pace/proxy.ts ✓
- /Users/christianmoore/ai/pace/src/lib/db/queries.ts ✓
- /Users/christianmoore/ai/pace/src/app/(app)/layout.tsx ✓
- /Users/christianmoore/ai/pace/src/app/(app)/dashboard/page.tsx ✓
- /Users/christianmoore/ai/pace/src/app/(auth)/login/page.tsx ✓
- /Users/christianmoore/ai/pace/src/app/(auth)/signup/page.tsx ✓
- /Users/christianmoore/ai/pace/src/components/auth/auth-card.tsx ✓
- /Users/christianmoore/ai/pace/src/components/auth/login-form.tsx ✓
- /Users/christianmoore/ai/pace/src/components/auth/signup-form.tsx ✓
- /Users/christianmoore/ai/pace/src/components/ui/error-banner.tsx ✓
- /Users/christianmoore/ai/pace/src/lib/copy.ts ✓
- /Users/christianmoore/ai/pace/tests/idor.test.ts ✓

Commits confirmed:
- 399ab84 (Task 1: proxy.ts + IDOR queries + protected layout)
- 83f7c78 (Task 2: login/signup UI + shadcn components)

Test suite: 41/41 pass (npx vitest run)
Build: npm run build exits 0
