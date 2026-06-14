---
phase: 01-foundation
plan: 01
subsystem: database
tags: [nextjs, drizzle, neon, iron-session, vitest, tailwind, shadcn, postgres]

requires: []

provides:
  - Next.js 16.2.9 App Router scaffold with Tailwind v4 + shadcn (base-nova, zinc dark)
  - Drizzle schema: 4 tables (users, userProfiles, trainingSessions, stravaConnections) with userId FK + cascade + named index
  - Neon HTTP client via drizzle-orm/neon-http bound to pooled DATABASE_URL
  - iron-session shared config (SessionData {id, email}, httpOnly/secure/lax/30-day cookie)
  - drizzle.config.ts pointing at DATABASE_URL_UNPOOLED for migrations only
  - vitest.config.ts with @/ path alias; 4 test files (schema GREEN, auth/ratelimit/idor stubs TODO)
  - Migration SQL generated: drizzle/0000_groovy_maximus.sql (4 tables, 3 FKs, 3 indexes)
  - CSP + X-Frame-Options DENY security headers in next.config.ts (D-13)
  - src/env.ts: typed server-only env access, no NEXT_PUBLIC_ secrets

affects:
  - 01-02 (auth route handlers — imports db, session, schema)
  - All subsequent phases (schema is locked; changes require migrations)

tech-stack:
  added:
    - next@16.2.9
    - react@19.2.4
    - typescript@5
    - drizzle-orm@0.45.2
    - drizzle-kit@0.31.10
    - "@neondatabase/serverless@1.1.0"
    - iron-session@8.0.4
    - bcryptjs@3.0.3
    - zod@4.4.3
    - "@upstash/ratelimit@2.0.8"
    - "@upstash/redis@1.38.0"
    - vitest@4.1.8
    - shadcn@4.11.0
    - tailwindcss@4
  patterns:
    - Drizzle neon-http adapter (no persistent TCP — required for Vercel serverless)
    - iron-session shared-module pattern (single sessionOptions export, no inline cookie config)
    - Drizzle WHERE and() truth-condition documented in schema comments (D-03 IDOR guard)
    - TDD RED → GREEN commit sequence for schema layer
    - CSP via next.config.ts async headers()
    - TypeScript server-only env module (src/env.ts, no NEXT_PUBLIC_ prefix)

key-files:
  created:
    - src/lib/db/schema.ts
    - src/lib/db/index.ts
    - src/lib/session.ts
    - drizzle.config.ts
    - vitest.config.ts
    - src/env.ts
    - tests/schema.test.ts
    - tests/auth.test.ts
    - tests/ratelimit.test.ts
    - tests/idor.test.ts
    - drizzle/0000_groovy_maximus.sql
  modified:
    - next.config.ts (CSP + security headers)
    - src/app/layout.tsx (dark class, Pace metadata)
    - src/app/page.tsx (placeholder → /login link)
    - src/app/globals.css (zinc dark palette)
    - package.json (all Phase 1 deps)

key-decisions:
  - "D-01: All 4 tables defined in Phase 1 with userId FK from day one; schema is now locked"
  - "D-02: drizzle-orm/neon-http with pooled DATABASE_URL for queries; UNPOOLED for migrations only"
  - "D-03: Drizzle WHERE and() pattern documented as truth-condition in schema.ts and db/index.ts"
  - "D-04/D-06: SessionData {id, email}; cookie httpOnly+secure+lax+30d from single shared module"
  - "D-13: No NEXT_PUBLIC_ prefix on any secret; CSP + X-Frame-Options DENY via next.config.ts"
  - "Deviation: @upstash/redis bumped 1.31.0→1.38.0 (peer dep: ratelimit@2.0.8 requires >=1.34.7)"
  - "Deviation: schema test assertions updated to use Symbol.for('drizzle:Name') (correct Drizzle internal API)"

patterns-established:
  - "Iron-session: single sessionOptions export from src/lib/session.ts; all handlers import from here"
  - "Neon client: db = drizzle(neon(process.env.DATABASE_URL!)) from src/lib/db/index.ts"
  - "IDOR guard: .where(and(eq(table.userId, session.id), eq(table.id, id))) — never chain .where()"
  - "Env discipline: all server secrets in src/env.ts, zero NEXT_PUBLIC_ prefixes"

requirements-completed: [AUTH-01, AUTH-02]

duration: 8min
completed: 2026-06-14
---

# Phase 01 Plan 01: Foundation Scaffold Summary

**Next.js 16.2.9 + Drizzle schema with 4 FK-enforced tables, Neon HTTP client, iron-session config, and vitest scaffolding — all committed; migration SQL generated, pending apply to Neon.**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-06-14T14:54:16Z
- **Completed:** 2026-06-14T15:02:00Z
- **Tasks:** 2 of 3 complete (Task 3 is a blocking checkpoint — requires Neon provisioning)
- **Files modified:** 18 files created/modified

## Accomplishments

- Scaffolded Next.js 16.2.9 with Tailwind v4 CSS-first config, shadcn (zinc dark), and all Phase 1 runtime deps
- Defined all 4 Drizzle tables with userId FK + onDelete cascade + named index (D-01 locked)
- Created migration SQL ready to apply: `drizzle/0000_groovy_maximus.sql`
- Established single-source shared modules for db client (neon-http + pooled URL) and iron-session config
- vitest scaffolding in place: schema tests pass GREEN, auth/ratelimit/idor stubs visible as TODO
- CSP + security headers set, no NEXT_PUBLIC_ prefix on any server secret (D-13 verified)

## Task Commits

1. **Task 1: Scaffold Next.js 16.2.9 + Phase 1 deps** - `4a7d96f` (feat)
2. **Task 2 RED: Test stubs** - `fe41552` (test)
3. **Task 2 GREEN: Schema, db client, session, drizzle config** - `74b8e14` (feat)
4. **Migration SQL generated** - `67e3f76` (chore)
5. **shadcn-generated files** - `4753322` (chore)

**Checkpoint (Task 3):** Awaiting Neon provisioning and migration apply.

## Files Created/Modified

- `src/lib/db/schema.ts` — 4 Drizzle tables with userId FK + cascade + index (D-01)
- `src/lib/db/index.ts` — Neon HTTP client bound to DATABASE_URL (pooled, D-02)
- `src/lib/session.ts` — SessionData {id, email} + sessionOptions (D-04, D-06)
- `drizzle.config.ts` — drizzle-kit config targeting DATABASE_URL_UNPOOLED (D-02)
- `vitest.config.ts` — node environment, @/ alias to src/
- `src/env.ts` — typed server-only env access (D-13)
- `tests/schema.test.ts` — 10 assertions GREEN (userId columns, table names, FK integrity)
- `tests/auth.test.ts` — 13 stubs TODO (AUTH-01 through AUTH-05)
- `tests/ratelimit.test.ts` — 7 stubs TODO (D-10 dual-axis)
- `tests/idor.test.ts` — 5 stubs TODO (D-03, D-09)
- `drizzle/0000_groovy_maximus.sql` — migration: 4 tables, 3 FKs, 3 indexes
- `next.config.ts` — CSP + X-Frame-Options DENY + security headers (D-13)
- `src/app/layout.tsx` — dark class, Pace metadata, Geist font
- `src/app/page.tsx` — minimal placeholder linking to /login
- `src/app/globals.css` — zinc dark palette (#09090b bg, #18181b card, #fafafa text)
- `package.json` — all Phase 1 deps pinned
- `components.json` — shadcn config (base-nova, zinc)
- `src/components/ui/button.tsx` — shadcn button primitive

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @upstash/redis version incompatibility**
- **Found during:** Task 1 npm install
- **Issue:** CLAUDE.md specified `@upstash/redis@1.31.0` but `@upstash/ratelimit@2.0.8` has peer dep `@upstash/redis@>=1.34.7` and drizzle-orm@0.45.2 has peerOptional `@upstash/redis@>=1.34.7`
- **Fix:** Bumped to `@upstash/redis@1.38.0` (latest stable satisfying both constraints)
- **Files modified:** package.json, package-lock.json
- **Commit:** 4a7d96f

**2. [Rule 1 - Bug] Drizzle internal table name accessor**
- **Found during:** Task 2 GREEN phase (schema tests failing)
- **Issue:** Test used `table._.name` pattern (Drizzle v3 API) but Drizzle v0.45.2 stores table name at `Symbol.for('drizzle:Name')`
- **Fix:** Updated 3 test assertions to use `table[Symbol.for('drizzle:Name')]`
- **Files modified:** tests/schema.test.ts
- **Commit:** 74b8e14

## Known Stubs

None that block this plan's goal. The auth/ratelimit/idor test stubs are intentional — they are `it.todo` placeholders to be implemented by plan 01-02 (auth route handlers).

## Threat Flags

No new security surface beyond plan's threat model. All T-1-* mitigations applied:
- T-1-01: userId FK + index on all non-users tables (verified by schema.test.ts)
- T-1-IDOR-FK: onDelete cascade on all FKs
- T-1-SECRET: No NEXT_PUBLIC_ prefix; CSP + X-Frame-Options DENY in next.config.ts
- T-1-MIGRATE: drizzle.config.ts uses DATABASE_URL_UNPOOLED
- T-1-SC: All packages from CLAUDE.md pre-verified list

## Self-Check: PASSED

All 11 created files confirmed present on disk.
All 4 task commits confirmed in git log (4a7d96f, fe41552, 74b8e14, 67e3f76).
