# Phase 1: Foundation - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the Next.js 16 app to Vercel, provision Neon Postgres via Marketplace, define the full Drizzle schema (all app tables with user_id FK enforced from day one), implement email/password auth via iron-session, enforce the SIGNUP_ENABLED flag with a first-user bootstrap bypass, and establish the security baseline: bcryptjs hashing, httpOnly signed cookies, generic auth errors (no user enumeration), rate limiting on the login endpoint, and per-user query scoping as a truth-condition.

**In scope:** Users table, all non-user app tables (user_profiles, training_sessions, strava_connections) with user_id FK, signup flow, login flow, logout, SIGNUP_ENABLED flag, iron-session cookie, rate limiting, proxy.ts route protection.

**Out of scope:** Onboarding wizard (Phase 2), profile editing (Phase 2), AI generation (Phase 3), Today view (Phase 4), Strava OAuth (Phase 5), PWA/service worker (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### DB Schema

- **D-01:** Define ALL app tables in Phase 1 — `users`, `user_profiles`, `training_sessions`, `strava_connections`. Every table except `users` carries a `user_id` UUID FK with an index. No table is ever created without it. This satisfies the "multi-user architecture from day one" locked constraint; retrofitting FKs in later phases is the exact failure mode this constraint prevents.
- **D-02:** Use `drizzle-orm/neon-http` with the pooled `DATABASE_URL` for all app queries. Use `DATABASE_URL_UNPOOLED` only for `drizzle-kit migrate`. Never mix the two at runtime.
- **D-03:** The Drizzle WHERE clause must use the `and()` single-call pattern (not chained `.where().where()`) on all user-scoped queries — this is a truth-condition from STATE.md to prevent IDOR. Document this in a comment in the query helper.

### Auth

- **D-04:** iron-session session payload is `{ id: string, email: string }`. No role field — single user type in v1. Email is included to avoid a DB roundtrip for nav display.
- **D-05:** bcryptjs at cost factor 12. Not native `bcrypt` or `argon2` — Vercel serverless has documented native binding failures with both. Pure JS avoids the issue entirely.
- **D-06:** Cookie config: `httpOnly: true`, `secure: true`, `sameSite: "lax"`. Session max age: 30 days (persistent across browser sessions per AUTH-02).
- **D-07:** Login returns a single generic error — "Invalid email or password" — for both wrong email and wrong password. Never distinguish the two (AUTH-04 anti-enumeration).

### Route Protection

- **D-08:** Use `proxy.ts` (not `middleware.ts` — renamed in Next.js 16) for blanket redirect of unauthenticated requests to `/login`. Protects all routes under `/(app)` or equivalent route group. Individual RSC layouts additionally call `getIronSession(await cookies(), sessionOptions)` to get the session object for data access.
- **D-09:** Cross-user resource access returns 404, not 403. Existence of a resource is never revealed to an unauthorized requester.

### Rate Limiting

- **D-10:** `@upstash/ratelimit` with Upstash Redis. Two limit axes for the login endpoint: per-IP (10 attempts / 15 min) and per-account email (5 attempts / 15 min). Whichever limit fires first blocks the request. Returns a generic "Too many attempts" message with no timing info.

### SIGNUP_ENABLED / Owner Bootstrap

- **D-11:** SIGNUP_ENABLED flag (`process.env.SIGNUP_ENABLED === "true"`) gates public registration. When false, the signup route rejects with "Registration is not open". Exception: if the `users` table is empty (zero rows), registration succeeds regardless of the flag — this is the owner bootstrap mechanism. No seed script, no extra env var; works on first Vercel deploy without additional setup.

### Security Baseline

- **D-12 [informational]:** CSRF protection on all state-changing routes (signup, login, logout) via the `sameSite: "lax"` cookie plus a `state` check pattern. No separate CSRF token library needed for same-origin SPA flows with SameSite=Lax. (Implicit in D-06 cookie config — no separate implementation task required.)
- **D-13:** No secrets in client bundles — verified via `NEXT_PUBLIC_` prefix discipline. `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `TOKEN_ENC_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `STRAVA_CLIENT_SECRET`, `UPSTASH_REDIS_REST_TOKEN` are server-only. CSP header set via Next.js config.

### Claude's Discretion

- Table column naming convention (snake_case via Drizzle default), index naming, exact Drizzle schema file structure (one file vs. per-table).
- Exact route group structure for the Next.js App Router (`/(app)` vs. `/(protected)` prefix).
- Specific Upstash Redis instance setup and env var injection (standard Upstash Vercel integration).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Authentication — AUTH-01 through AUTH-05 are the acceptance criteria for this phase
- `.planning/ROADMAP.md` §Phase 1 — success criteria list (5 items); must all be TRUE at phase end
- `.planning/PROJECT.md` §Security baseline — httpOnly cookies, 404-not-403, generic errors, Drizzle WHERE and() pattern
- `.planning/PROJECT.md` §Key Decisions — "multi-user architecture from Phase 0" and "Neon Postgres (not Vercel Postgres)" are locked

### Tech Stack (authoritative versions from CLAUDE.md)
- `CLAUDE.md` §Technology Stack — authoritative versions: Next.js 16.2.9, Node 20.9+ (hard floor, Next.js 16 drops Node 18), iron-session 8.0.4, bcryptjs 3.0.3, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, @neondatabase/serverless 1.1.0, Zod 4.4.3, @upstash/ratelimit 2.0.8
- `CLAUDE.md` §Critical Version Constraints — `proxy.ts` not `middleware.ts`; `cookies()` and `headers()` are async and must be awaited; `"use cache"` directive required for explicit caching; Zod v4 breaking changes (`z.email()` not `.string().email()`, `error.issues` not `.errors`)

### External Services
- Neon Postgres via Vercel Marketplace — injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct); use pooled for queries, direct for migrations
- Upstash Redis via Vercel Marketplace — injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None yet — Phase 1 establishes all patterns. Future phases will inherit from whatever is built here.

### Integration Points
- Drizzle schema defined here is consumed by every subsequent phase. Schema changes after Phase 1 require Drizzle migrations.
- iron-session options object (cookie name, secret, maxAge) should be exported from a single shared file so all server components, route handlers, and proxy.ts import the same config.

</code_context>

<specifics>
## Specific Ideas

- The Drizzle single `and()` WHERE pattern for user scoping must be documented with a comment in a shared query helper or in the schema file itself — per STATE.md this is a truth-condition, not just a convention.
- On first deploy to Vercel: run `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED`; Neon cold-start on first query after deploy is expected.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-14*
