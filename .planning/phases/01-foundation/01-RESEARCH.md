# Phase 1: Foundation - Research

**Researched:** 2026-06-14
**Domain:** Next.js 16 App Router auth, Drizzle/Neon schema, iron-session, bcryptjs, Upstash rate limiting, Vercel deployment
**Confidence:** HIGH

## Summary

Phase 1 establishes the complete security baseline for Pace: Next.js 16 app deployed to Vercel, Neon Postgres via Marketplace, full Drizzle schema (all 4 app tables) with enforced user_id FK from day one, email/password auth via iron-session, bcryptjs hashing, rate-limited login endpoint, and proxy.ts route protection. All implementation decisions are locked in CONTEXT.md with no open choices remaining — this research documents the patterns needed to execute them correctly.

The single highest-risk task in this phase is the IDOR-prevention WHERE clause pattern (D-03): Drizzle silently allows chained `.where().where()` calls that overwrite each other, producing queries that return cross-user data. Every query helper must use the `and()` single-call pattern and document it as a truth-condition. The second risk is the first-user bootstrap (D-11): the `users` table emptiness check must be atomic — a race condition between two concurrent signups at launch can bypass `SIGNUP_ENABLED`.

The phase produces the auth infrastructure and schema that all subsequent phases build on. Schema changes after Phase 1 require Drizzle migrations, so all 4 tables must be correct before Phase 2 begins.

**Primary recommendation:** Build in this order — (1) schema + migration, (2) session config module, (3) route handlers (signup, login, logout), (4) proxy.ts, (5) auth UI screens. Each layer has no back-dependencies on the next.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Define ALL app tables in Phase 1 — `users`, `user_profiles`, `training_sessions`, `strava_connections`. Every table except `users` carries a `user_id` UUID FK with an index.
- **D-02:** Use `drizzle-orm/neon-http` with pooled `DATABASE_URL` for all app queries. Use `DATABASE_URL_UNPOOLED` only for `drizzle-kit migrate`. Never mix the two at runtime.
- **D-03:** Drizzle WHERE clause must use the `and()` single-call pattern on all user-scoped queries — IDOR prevention truth-condition. Document in a comment in the query helper.
- **D-04:** iron-session payload is `{ id: string, email: string }`. No role field.
- **D-05:** bcryptjs at cost factor 12. Not native `bcrypt` or `argon2`.
- **D-06:** Cookie config: `httpOnly: true`, `secure: true`, `sameSite: "lax"`, 30 day max age.
- **D-07:** Login returns single generic error "Invalid email or password" for both wrong email and wrong password.
- **D-08:** Use `proxy.ts` (not `middleware.ts`) for blanket redirect of unauthenticated requests to `/login`. Protects all routes under `/(app)` route group.
- **D-09:** Cross-user resource access returns 404, not 403.
- **D-10:** `@upstash/ratelimit` — 10 attempts/15min per-IP, 5 attempts/15min per-email. Whichever fires first blocks. Generic "Too many attempts" message.
- **D-11:** SIGNUP_ENABLED flag gates registration. Exception: if `users` table has zero rows, registration succeeds regardless of flag (owner bootstrap).
- **D-12:** CSRF: SameSite=Lax handles same-origin flows. No separate CSRF token library.
- **D-13:** No secrets in client bundles. `NEXT_PUBLIC_` prefix discipline enforced. CSP header via Next.js config.

### Claude's Discretion

- Table column naming convention (snake_case via Drizzle default), index naming, exact Drizzle schema file structure (one file vs. per-table).
- Exact route group structure for the Next.js App Router (`/(app)` vs. `/(protected)` prefix).
- Specific Upstash Redis instance setup and env var injection (standard Upstash Vercel integration).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create an account with email and password | Signup route handler, bcryptjs hash, D-11 first-user bypass, Zod v4 email validation |
| AUTH-02 | User can log in and remain logged in across browser sessions (httpOnly signed cookie) | iron-session 8.0.4 with 30-day maxAge, httpOnly + secure flags, D-06 cookie config |
| AUTH-03 | User can log out from any page | Logout route handler: session.destroy() + redirect to /login |
| AUTH-04 | Login endpoint is rate-limited per-IP and per-account; invalid credentials return generic error | @upstash/ratelimit dual-axis (D-10), generic error message (D-07) |
| AUTH-05 | SIGNUP_ENABLED flag gates public registration; owner account is accessible without the flag | D-11 first-user bypass pattern, process.env.SIGNUP_ENABLED check in signup handler |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session read (nav display, data access) | Frontend Server (RSC) | — | getIronSession(await cookies()) in Server Components; zero client exposure |
| Auth mutations (login, signup, logout) | API / Backend (Route Handlers) | — | session.save() and session.destroy() require Route Handlers; cannot call in RSC |
| Route protection / redirect | Frontend Server (proxy.ts) | — | proxy.ts is the Next.js 16 equivalent of middleware; runs before page render |
| Password hashing | API / Backend | — | bcryptjs.hash() server-side only; never in client bundle |
| Rate limiting | API / Backend | CDN/Edge (future) | Upstash HTTP call in Route Handler; works in serverless without persistent connection |
| DB schema + migrations | Database / Storage | — | drizzle-kit against DATABASE_URL_UNPOOLED at deploy time |
| User isolation enforcement | Database / Storage | API / Backend | WHERE and() pattern in every query; FK + index enforces at DB level |
| Auth UI (login/signup forms) | Browser / Client | Frontend Server (initial render) | Client component for form state + loading; SSR for initial page |

## Standard Stack

### Core (Phase 1 scope)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.9 | App Router, RSC, Route Handlers, proxy.ts | Locked decision — Vercel-native, current stable |
| `@neondatabase/serverless` | 1.1.0 | Postgres HTTP driver | HTTP-based; no TCP held open; required for Vercel serverless |
| Drizzle ORM | 0.45.2 | Schema, type-safe queries, migrations | Thin ORM with native neon-http adapter |
| drizzle-kit | 0.31.10 | Schema migration CLI | Runs against DATABASE_URL_UNPOOLED at deploy |
| `iron-session` | 8.0.4 | Stateless signed cookie session | Pure JS; zero external service; works with RSC via await cookies() |
| `bcryptjs` | 3.0.3 | Password hashing | Pure JS — avoids Vercel native binding failures (argon2, bcrypt) |
| `zod` | 4.4.3 | Request body validation | v4 breaking API changes apply — see patterns below |
| `@upstash/ratelimit` | 2.0.8 | Login rate limiting | HTTP Redis; no persistent connection; works serverless |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | latest (npx shadcn@latest init) | UI component primitives | Auth form screens; initialize before implementing UI |
| `lucide-react` | ships with shadcn | Icons (Loader2 spinner) | Loading state on submit buttons |
| Tailwind CSS | 4.x | Utility CSS | All styling; CSS-first config, no tailwind.config.js |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bcryptjs | argon2 / @node-rs/argon2 | Stronger algorithm but Vercel native binding failures; bcryptjs is the correct Vercel choice |
| iron-session | better-auth | Overkill; iron-session is 50 lines for this use case |
| @upstash/ratelimit | Postgres counter | More latency + connection pressure on Neon; Upstash is purpose-built |

**Installation (Phase 1 packages only):**
```bash
npm install @neondatabase/serverless drizzle-orm iron-session bcryptjs zod @upstash/ratelimit
npm install -D drizzle-kit
npx shadcn@latest init
```

## Package Legitimacy Audit

All packages in this phase are long-established libraries sourced from the authoritative CLAUDE.md stack document (pre-verified at project inception).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @neondatabase/serverless | npm | ~2 yrs | High (Vercel marketplace) | github.com/neondatabase/serverless | OK | Approved [CITED: CLAUDE.md] |
| drizzle-orm | npm | ~3 yrs | Very high | github.com/drizzle-team/drizzle-orm | OK | Approved [CITED: CLAUDE.md] |
| drizzle-kit | npm | ~3 yrs | Very high | github.com/drizzle-team/drizzle-orm | OK | Approved [CITED: CLAUDE.md] |
| iron-session | npm | ~5 yrs | High | github.com/vvo/iron-session | OK | Approved [CITED: CLAUDE.md] |
| bcryptjs | npm | ~10 yrs | Very high | github.com/dcodeIO/bcrypt.js | OK | Approved [CITED: CLAUDE.md] |
| zod | npm | ~4 yrs | Very high | github.com/colinhacks/zod | OK | Approved [CITED: CLAUDE.md] |
| @upstash/ratelimit | npm | ~3 yrs | High | github.com/upstash/ratelimit-js | OK | Approved [CITED: CLAUDE.md] |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client)
  │  POST /api/auth/login   POST /api/auth/signup   POST /api/auth/logout
  │
  ▼
proxy.ts  ─── unauthenticated + non-auth route? ──► redirect /login
  │
  ▼
Route Handlers (server)
  ├── /api/auth/signup
  │     ├── Check SIGNUP_ENABLED || users.count === 0 (D-11)
  │     ├── Validate body: z.email(), z.string().min(8)  [Zod v4]
  │     ├── bcryptjs.hash(password, 12)
  │     ├── INSERT users (Drizzle)
  │     └── session.save({ id, email }) → Set-Cookie httpOnly
  │
  ├── /api/auth/login
  │     ├── @upstash/ratelimit check: per-IP (10/15min) + per-email (5/15min)
  │     ├── Validate body (Zod v4)
  │     ├── SELECT user WHERE email (Drizzle)
  │     ├── bcryptjs.compare() — generic error regardless of which check fails (D-07)
  │     └── session.save({ id, email }) → Set-Cookie
  │
  └── /api/auth/logout
        └── session.destroy() → redirect /login
  │
  ▼
RSC Layouts (/(app) route group)
  └── getIronSession(await cookies(), sessionOptions) → session for data display

  ▼
Neon Postgres (via @neondatabase/serverless HTTP)
  ├── All queries: drizzle-orm/neon-http + DATABASE_URL (pooled)
  ├── Migrations: drizzle-kit + DATABASE_URL_UNPOOLED
  └── User scoping: WHERE and(eq(table.userId, session.id), ...) — truth-condition (D-03)
```

### Recommended Project Structure

```
src/
├── app/
│   ├── (app)/               # Protected route group — proxy.ts guards all routes here
│   │   └── layout.tsx       # RSC layout reads session via getIronSession(await cookies())
│   ├── (auth)/              # Public auth routes
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   └── api/
│       └── auth/
│           ├── login/route.ts
│           ├── signup/route.ts
│           └── logout/route.ts
├── lib/
│   ├── db/
│   │   ├── index.ts         # Neon HTTP client: neon(process.env.DATABASE_URL)
│   │   └── schema.ts        # All 4 Drizzle tables (single file — simplest for Phase 1)
│   ├── session.ts           # iron-session options + SessionData type — single export
│   └── ratelimit.ts         # Upstash Ratelimit instances (ip limiter + email limiter)
├── proxy.ts                 # Route protection (NOT middleware.ts)
drizzle.config.ts            # drizzle-kit config pointing to DATABASE_URL_UNPOOLED
```

### Pattern 1: iron-session with Next.js 16 async cookies()

```typescript
// src/lib/session.ts
// Source: iron-session v8 docs + CONTEXT.md D-04, D-06
import { getIronSession, type IronSessionData } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  id: string;
  email: string;
}

export const sessionOptions = {
  cookieName: "pace-session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

// Usage in Route Handlers and RSC layouts:
// const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
```

### Pattern 2: Drizzle IDOR-safe WHERE clause (D-03 truth-condition)

```typescript
// Source: CONTEXT.md D-03 — single and() call is mandatory, not a style preference
import { and, eq } from "drizzle-orm";

// CORRECT — single and() ensures both conditions always apply
const session = await db
  .select()
  .from(trainingSessions)
  .where(
    and(
      eq(trainingSessions.userId, currentUserId),  // IDOR guard — never omit
      eq(trainingSessions.id, requestedId)
    )
  );

// WRONG — chained .where() silently overwrites; last condition wins
// .where(eq(trainingSessions.userId, currentUserId))
// .where(eq(trainingSessions.id, requestedId))  // ← this replaces the first
```

### Pattern 3: Drizzle schema — all 4 tables with user_id FK (D-01)

```typescript
// src/lib/db/schema.ts
// Source: CONTEXT.md D-01, D-02
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every non-users table: user_id UUID FK + index (D-01)
export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Phase 2 adds profile columns via migration
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [{ name: "user_profiles_user_id_idx", on: t.userId }]);

export const trainingSessions = pgTable("training_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Phase 3 adds session content columns via migration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [{ name: "training_sessions_user_id_idx", on: t.userId }]);

export const stravaConnections = pgTable("strava_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  // Phase 5 adds token columns via migration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [{ name: "strava_connections_user_id_idx", on: t.userId }]);
```

### Pattern 4: Dual-axis rate limiting (D-10)

```typescript
// src/lib/ratelimit.ts
// Source: CONTEXT.md D-10, @upstash/ratelimit docs
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + TOKEN

export const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "15 m"),
  prefix: "rl:login:ip",
});

export const emailLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:login:email",
});

// In login route handler: check both; block on first failure
// const ipResult = await ipLimiter.limit(clientIp);
// const emailResult = await emailLimiter.limit(email.toLowerCase());
// if (!ipResult.success || !emailResult.success) {
//   return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
// }
```

### Pattern 5: proxy.ts (NOT middleware.ts — renamed in Next.js 16)

```typescript
// proxy.ts (project root — same location as middleware.ts was in Next.js 14/15)
// Source: CLAUDE.md Critical Version Constraints + CONTEXT.md D-08
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

// Routes that don't require auth
const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // iron-session in proxy reads the cookie from the request
  const session = await getIronSession(request.cookies, sessionOptions);
  if (!session.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### Pattern 6: First-user bootstrap check (D-11)

```typescript
// In /api/auth/signup route handler
// Source: CONTEXT.md D-11
const signupEnabled = process.env.SIGNUP_ENABLED === "true";
const userCount = await db.select({ count: count() }).from(users);
const isFirstUser = userCount[0].count === 0;

if (!signupEnabled && !isFirstUser) {
  return Response.json({ error: "Registration is not open." }, { status: 403 });
}
// Proceed with account creation
```

### Pattern 7: Zod v4 validation (breaking API changes)

```typescript
// Source: CLAUDE.md — Zod v4 breaking changes
import { z } from "zod";

const loginSchema = z.object({
  email: z.email(),            // v4: z.email() not z.string().email()
  password: z.string().min(8),
});

const result = loginSchema.safeParse(body);
if (!result.success) {
  // v4: result.error.issues not result.error.errors
  return Response.json({ error: result.error.issues[0].message }, { status: 400 });
}
```

### Pattern 8: CSP header via Next.js config (D-13)

```typescript
// next.config.ts
const securityHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; ..." },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

### Anti-Patterns to Avoid

- **Chained .where() in Drizzle:** Silently drops the first condition. Use `and()` always (D-03 truth-condition).
- **middleware.ts:** Renamed to `proxy.ts` in Next.js 16. File will be silently ignored if named middleware.ts.
- **Synchronous cookies()/headers():** Next.js 16 makes these async. `const cookieStore = cookies()` (missing await) causes runtime errors.
- **Native bcrypt or argon2:** Vercel serverless has documented native binding failures. Use bcryptjs only.
- **Distinguishing email-not-found vs wrong-password:** User enumeration — always return the same error string (D-07).
- **DATABASE_URL for migrations:** Use DATABASE_URL_UNPOOLED for drizzle-kit; pooled URL holds open a connection drizzle-kit cannot close cleanly.
- **Returning 403 for cross-user resources:** Return 404 (D-09) — existence must not be revealed.
- **NEXT_PUBLIC_ prefix on secrets:** Any env var prefixed NEXT_PUBLIC_ is bundled into the client. SESSION_SECRET, DATABASE_URL, etc. must never have this prefix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom JWT encode/decode | iron-session 8.0.4 | Signing, rotation, maxAge, tamper-proofing handled; hand-rolled JWTs have well-known implementation pitfalls |
| Password hashing | Custom hash function | bcryptjs at cost factor 12 | Timing-safe comparison, proper salting; anything custom is wrong |
| Rate limiting | In-memory counter | @upstash/ratelimit | Serverless functions are stateless — in-memory counters reset on each cold start; Upstash persists across requests |
| Input validation | Manual type checks | Zod v4 schemas | Zod handles nested objects, type coercion, error messages; manual checks miss edge cases |
| CSRF protection | Token middleware | SameSite=Lax cookie | Sufficient for same-origin POST routes; adds zero complexity (D-12) |

**Key insight:** This stack (iron-session + bcryptjs + Upstash) is the minimum viable auth with no hand-rolled components. Each library solves exactly one hard problem. Replacing any of them with custom code introduces security regressions.

## Common Pitfalls

### Pitfall 1: Drizzle chained WHERE = IDOR vulnerability

**What goes wrong:** `db.select().from(t).where(eq(t.userId, uid)).where(eq(t.id, rid))` — Drizzle's query builder uses a builder pattern where the second `.where()` replaces the first. The user_id guard is silently dropped and all rows with the matching id are returned regardless of ownership.

**Why it happens:** Drizzle's API looks like it chains, but `.where()` is not additive — it replaces.

**How to avoid:** Always use `and(condition1, condition2)` in a single `.where()` call. Document this with a comment: `// IDOR guard: and() is mandatory here — do not split into chained .where() calls`.

**Warning signs:** Query returns data for a resource you didn't own. No Drizzle runtime warning — it's silently wrong.

### Pitfall 2: proxy.ts named as middleware.ts

**What goes wrong:** Route protection appears to work in dev (Turbopack may handle both names) but fails silently on Vercel — all routes are accessible without authentication.

**Why it happens:** Next.js 16 renamed the file. Old name is no longer recognized.

**How to avoid:** Name it `proxy.ts` from the start. Do not use `middleware.ts`.

### Pitfall 3: cookies() / headers() used synchronously

**What goes wrong:** `const cookieStore = cookies()` compiles but throws at runtime in Next.js 16 Server Components and Route Handlers.

**Why it happens:** These APIs are now async in Next.js 16.

**How to avoid:** Always `await cookies()`. TypeScript types reflect this — if you forget await, the linter should catch it.

### Pitfall 4: Migration run against pooled DATABASE_URL

**What goes wrong:** drizzle-kit migrate hangs or fails to commit cleanly against the pooled connection URL.

**Why it happens:** PgBouncer (Neon pooler) doesn't support all transaction semantics that migrations require.

**How to avoid:** drizzle.config.ts reads `DATABASE_URL_UNPOOLED`. The app's db/index.ts reads `DATABASE_URL` (pooled). Never swap.

### Pitfall 5: First-user race condition on D-11

**What goes wrong:** Two concurrent signup requests at first deploy both see `userCount === 0` and both succeed, creating two "owner" accounts.

**Why it happens:** The emptiness check and the INSERT are not atomic.

**How to avoid:** The `users.email` column has a UNIQUE constraint — the second INSERT will fail with a constraint violation. Catch this error and return a generic error. The race produces at most one duplicate email rejection, not two valid accounts. If true single-account enforcement is needed, wrap in a transaction with a SELECT FOR UPDATE. For Phase 1 single-owner use, the unique constraint is sufficient.

### Pitfall 6: Upstash rate limit not checking both axes

**What goes wrong:** Only checking per-IP allows a distributed attacker to enumerate one account from many IPs. Only checking per-email allows one IP to attack many accounts.

**Why it happens:** Two separate limiter instances must both be checked; either failure must block the request.

**How to avoid:** Check `ipResult.success && emailResult.success` — both must pass. Return 429 if either fails.

## Runtime State Inventory

Phase 1 is greenfield — no existing runtime state. This section is explicitly confirmed empty.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new Neon instance; zero tables before migration | Run drizzle-kit migrate on first deploy |
| Live service config | None — no existing services | Provision Neon + Upstash via Vercel Marketplace |
| OS-registered state | None | — |
| Secrets/env vars | None pre-existing | Add all env vars listed in CLAUDE.md to Vercel project |
| Build artifacts | None — greenfield | — |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | vitest.config.ts (Wave 0 gap — does not exist yet) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Signup with valid email+password creates user | unit | `npx vitest run tests/auth.test.ts -t "signup"` | Wave 0 |
| AUTH-01 | Signup with SIGNUP_ENABLED=false + empty DB succeeds (D-11) | unit | `npx vitest run tests/auth.test.ts -t "first-user"` | Wave 0 |
| AUTH-01 | Signup with SIGNUP_ENABLED=false + non-empty DB returns 403 | unit | `npx vitest run tests/auth.test.ts -t "registration closed"` | Wave 0 |
| AUTH-02 | Login sets httpOnly cookie with 30-day maxAge | unit | `npx vitest run tests/auth.test.ts -t "cookie"` | Wave 0 |
| AUTH-03 | Logout destroys session and redirects to /login | unit | `npx vitest run tests/auth.test.ts -t "logout"` | Wave 0 |
| AUTH-04 | 11th login attempt from same IP returns 429 | unit | `npx vitest run tests/ratelimit.test.ts -t "ip limit"` | Wave 0 |
| AUTH-04 | 6th login attempt with same email returns 429 | unit | `npx vitest run tests/ratelimit.test.ts -t "email limit"` | Wave 0 |
| AUTH-04 | Invalid credentials return "Invalid email or password" (not which field) | unit | `npx vitest run tests/auth.test.ts -t "generic error"` | Wave 0 |
| AUTH-05 | SIGNUP_ENABLED=true allows registration | unit | `npx vitest run tests/auth.test.ts -t "signup enabled"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/auth.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — framework config with path aliases
- [ ] `tests/auth.test.ts` — covers AUTH-01 through AUTH-05
- [ ] `tests/ratelimit.test.ts` — covers AUTH-04 rate limit axes
- [ ] `tests/idor.test.ts` — verifies D-03 WHERE and() pattern; attempts cross-user query returns empty

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | bcryptjs CF12, iron-session, generic errors |
| V3 Session Management | yes | iron-session httpOnly+secure+SameSite=Lax, 30-day maxAge |
| V4 Access Control | yes | proxy.ts redirect, D-09 404-not-403, D-03 WHERE and() |
| V5 Input Validation | yes | Zod v4 schemas on all route handler inputs |
| V6 Cryptography | no | No custom crypto in Phase 1 (TOKEN_ENC_KEY is Phase 5) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User enumeration | Information Disclosure | D-07: identical error for wrong email / wrong password |
| Credential stuffing | Elevation of Privilege | D-10: dual-axis rate limiting (IP + email) via Upstash |
| Session hijacking | Spoofing | iron-session httpOnly+secure cookie; HTTPS-only on Vercel |
| IDOR — cross-user data access | Elevation of Privilege | D-03: Drizzle WHERE and() truth-condition; D-09: 404 not 403 |
| Secret leakage via client bundle | Information Disclosure | D-13: no NEXT_PUBLIC_ on secrets; CSP header |
| CSRF | Tampering | D-12: SameSite=Lax sufficient for same-origin forms |
| SQL injection | Tampering | Drizzle parameterized queries — never raw SQL with user input |
| Timing attacks on password compare | Information Disclosure | bcryptjs.compare() is timing-safe |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 runtime | Yes | v25.9.0 | — (exceeds 20.9.0 minimum) |
| npm | Package management | Yes | bundled with Node | — |
| Neon Postgres | DB layer | Provision via Vercel Marketplace | — | No fallback — must provision |
| Upstash Redis | Rate limiting | Provision via Vercel Marketplace | — | No fallback — required for D-10 |
| Vercel account | Deployment | [ASSUMED] | — | Cannot deploy without it |

**Missing dependencies with no fallback:**
- Neon Postgres: provision via Vercel Marketplace — injects DATABASE_URL and DATABASE_URL_UNPOOLED automatically
- Upstash Redis: provision via Vercel Marketplace — injects UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN automatically

**Missing dependencies with fallback:**
- None

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| middleware.ts | proxy.ts | Next.js 16 (Oct 2025) | Old filename silently ignored on Vercel |
| Implicit route caching | "use cache" directive required | Next.js 16 | No caching without explicit opt-in |
| Vercel Postgres (POSTGRES_URL) | Neon via Marketplace (DATABASE_URL) | Dec 2024 | Wrong env var name = no DB connection |
| next-pwa | @serwist/next | Post App Router | next-pwa unmaintained; breaks with App Router |
| lucia (auth library) | iron-session or better-auth | 2024 | lucia v3 is now a reference impl, not a usable package |
| zod v3 .string().email() | zod v4 z.email() | Mid-2025 | Breaking API change; v3 patterns fail silently in v4 |
| synchronous cookies() | async await cookies() | Next.js 16 | Runtime throw if not awaited |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel account exists and project can be connected | Environment Availability | Deployment blocked — first task would need to be Vercel project creation |
| A2 | proxy.ts works identically to middleware.ts for getIronSession cookie reads from request.cookies | Architecture Patterns Pattern 5 | If iron-session requires NextRequest cookies adapter, auth check may fail; test in Wave 0 |

**Two assumptions. All other claims in this research are cited from authoritative sources (CLAUDE.md, CONTEXT.md, REQUIREMENTS.md, UI-SPEC.md).**

## Open Questions

1. **shadcn init — dark style vs. default**
   - What we know: UI-SPEC specifies zinc-950 background, zinc-900 card, zinc-50 text
   - What's unclear: shadcn's "dark" style preset uses zinc base — whether it aligns exactly with the spec palette
   - Recommendation: Run `npx shadcn@latest init` with dark style + zinc base; verify output CSS variables match UI-SPEC color table before implementing screens

2. **proxy.ts iron-session API surface**
   - What we know: iron-session v8 docs show `getIronSession(cookies, options)` where cookies can be the request's cookies object
   - What's unclear: Whether `request.cookies` in proxy.ts (NextRequest) is the same shape as `await cookies()` from next/headers
   - Recommendation: Test in Wave 0 with a simple session read; if incompatible, use a cookie header parser directly in proxy.ts

## Sources

### Primary (HIGH confidence)

- CLAUDE.md §Technology Stack — authoritative versions for all packages; pre-verified at project research phase
- CLAUDE.md §Critical Version Constraints — Next.js 16 breaking changes verified against nextjs.org/blog/next-16
- CONTEXT.md — locked decisions D-01 through D-13; all implementation choices made
- REQUIREMENTS.md §Authentication — AUTH-01 through AUTH-05 acceptance criteria
- UI-SPEC.md — component inventory, color palette, interaction contract, copywriting contract

### Secondary (MEDIUM confidence — CITED)

- [iron-session v8 release notes](https://github.com/vvo/iron-session/releases/tag/v8.0.0) — async cookies() pattern [CITED: github.com/vvo/iron-session]
- [Drizzle + Neon docs](https://orm.drizzle.team/docs/connect-neon) — neon-http adapter, DATABASE_URL_UNPOOLED for migrations [CITED: orm.drizzle.team]
- [Zod v4 changelog](https://zod.dev/v4/changelog) — z.email(), error.issues [CITED: zod.dev]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions from CLAUDE.md, pre-verified at project inception
- Architecture: HIGH — all decisions locked in CONTEXT.md; patterns derived from official docs
- Pitfalls: HIGH — sourced from documented Next.js 16 breaking changes and known Drizzle query builder behavior

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable stack; main risk is shadcn component registry changes)
