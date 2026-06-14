# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 1-Foundation
**Mode:** --auto (all gray areas auto-selected; recommended defaults applied)
**Areas discussed:** DB Schema Scope, Route Protection Pattern, Session Payload, Owner Bootstrap

---

## DB Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-1-only (users table) | Define only the users table; later phases add their own tables | |
| All tables upfront | Define users + all app tables (user_profiles, training_sessions, strava_connections) with user_id FK now | ✓ |

**Auto-selected:** All tables upfront
**Notes:** "Multi-user architecture from Phase 0" is a locked constraint in PROJECT.md. Retrofitting FK columns in later phases is the exact failure mode this constraint prevents. Schema-first is the only coherent choice given that constraint.

---

## Route Protection Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Per-layout RSC check only | Each layout calls getIronSession and redirects if no session | |
| proxy.ts + RSC layout | proxy.ts does blanket redirect for unauthenticated requests; layouts read session for data | ✓ |
| Middleware (deprecated) | middleware.ts was renamed to proxy.ts in Next.js 16 — not a valid option | |

**Auto-selected:** proxy.ts + RSC layout
**Notes:** Next.js 16 renamed middleware.ts to proxy.ts; CLAUDE.md explicitly documents this. proxy.ts is the only correct blanket-protection mechanism. Layouts still read session for server component data access.

---

## Session Payload

| Option | Description | Selected |
|--------|-------------|----------|
| { id } only | Minimal; requires DB query for any email display | |
| { id, email } | Avoids nav-bar DB query; minimal extra cookie size | ✓ |
| { id, email, role } | Future-proofing for roles; not needed in v1 (single user type) | |

**Auto-selected:** { id, email }
**Notes:** Email avoids a DB roundtrip for rendering "Logged in as X" in nav. Role field explicitly deferred — v1 has a single user type; adding it now adds complexity with no benefit.

---

## Owner Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script | Run `drizzle-kit seed` or similar after deploy | |
| OWNER_EMAIL env var | Pre-create the owner account if env var is set | |
| First-user bypass | If users table is empty, registration succeeds regardless of SIGNUP_ENABLED | ✓ |

**Auto-selected:** First-user bypass
**Notes:** No extra scripts, no extra env vars. Works on first Vercel deploy with zero additional steps. Industry-standard pattern for admin bootstrap. Once one user exists, SIGNUP_ENABLED=false blocks all others.

---

## Claude's Discretion

- Table column naming convention (snake_case via Drizzle default)
- Index naming and exact schema file structure (one file vs. per-table files)
- Exact Next.js route group naming (`/(app)` vs `/(protected)`)
- Upstash Redis Vercel integration setup steps

## Deferred Ideas

None — discussion stayed within Phase 1 scope.
