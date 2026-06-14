# Architecture Patterns

**Project:** Pace — AI-assisted cycling training app
**Researched:** 2026-06-14
**Scope:** Next.js App Router, Strava OAuth, Drizzle/Neon, iron-session, .zwo generation, PWA

---

## Recommended Architecture

```
Browser (PWA)
    │
    ├── Next.js Middleware (src/middleware.ts)
    │       session check → redirect to /login if unauthenticated
    │
    ├── App Router Pages (src/app/)
    │       Server Components fetch from DB directly via lib/db
    │       Client Components use TanStack Query → Route Handlers
    │
    ├── Route Handlers (src/app/api/)
    │       /api/auth/login, /api/auth/logout, /api/auth/signup
    │       /api/sessions/generate          ← AI generation
    │       /api/sessions/[id]/export       ← .zwo download
    │       /api/strava/connect             ← OAuth initiation
    │       /api/strava/callback            ← OAuth token exchange
    │       /api/strava/sync                ← activity pull + match
    │       /api/user/profile               ← profile CRUD
    │
    └── Service Layer (src/lib/)
            ai/generate.ts        ← Anthropic SDK + Zod validation
            strava/client.ts      ← token refresh + API calls
            zwo/builder.ts        ← .zwo XML construction
            db/schema.ts          ← Drizzle schema
            db/index.ts           ← Neon client + pool
            session.ts            ← iron-session helpers
            auth/                 ← bcrypt, password policy
            rate-limit/           ← per-user/per-IP limits
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/middleware.ts` | Session presence check; redirects unauthenticated users | iron-session cookies |
| `src/app/` pages | Server-rendered views; no business logic | lib/db (direct), Route Handlers via TanStack Query |
| `src/app/api/auth/` | Login, logout, signup; sets iron-session cookie | lib/auth, lib/db |
| `src/app/api/sessions/generate` | Rate-check → AI prompt → Zod validate → safety gate → persist | lib/ai, lib/db, lib/rate-limit |
| `src/app/api/sessions/[id]/export` | Fetch session from DB → call zwo/builder → stream file download | lib/db, lib/zwo |
| `src/app/api/strava/` | OAuth flow, token exchange, activity sync | lib/strava, lib/db |
| `lib/ai/generate.ts` | Anthropic SDK call; validates output against Zod schema; rejects malformed/out-of-bounds | @anthropic-ai/sdk, zod |
| `lib/strava/client.ts` | Decrypt token → check expiry → refresh if needed → make API call | lib/db (token store), node:crypto |
| `lib/zwo/builder.ts` | Assemble XML from typed session struct; escape user text | — (pure, no I/O) |
| `lib/db/schema.ts` | All table definitions; every table carries `user_id` FK | drizzle-orm/pg-core |
| `lib/session.ts` | `getSession()` helper; used by every Route Handler and Server Action | iron-session, next/headers |

---

## Data Flow

### AI Generation (core loop step 1)

```
Client POST /api/sessions/generate
  → Route Handler: read iron-session (user_id)
  → lib/rate-limit: check per-user daily generation count
  → lib/db: fetch user profile (goals, FTP, weight, injury_notes)
  → lib/ai/generate: build prompt (injury_notes in delimited block)
      → Anthropic Messages API (claude-sonnet-4-6, non-streaming)
      → Zod schema validation on parsed JSON
      → deterministic safety gate (duration cap, watt cap relative to FTP)
      → reject if any check fails (400 + reason)
  → lib/db: INSERT into sessions (user_id = session.userId)
  → return session JSON to client
```

**Non-streaming is correct here.** The generated session is a structured JSON object (not a token stream), validated in full before persisting. Vercel Fluid Compute handles the 10–20s Claude latency without a timeout issue. Streaming is only beneficial when showing incremental text to a user; here the client needs the complete, validated object to proceed.

### Strava Token Refresh (per-request, lazy)

```
Any /api/strava/* handler
  → lib/strava/client.ts: getValidToken(userId)
      → lib/db: SELECT access_token, refresh_token, expires_at FROM strava_tokens WHERE user_id = $1
      → node:crypto AES-GCM decrypt both tokens
      → if expires_at - now() < 5min:
            POST https://www.strava.com/oauth/token (refresh grant)
            re-encrypt new tokens
            UPDATE strava_tokens SET ... WHERE user_id = $1
      → return decrypted access_token
  → make Strava API call with token
```

No dedicated refresh endpoint. Serverless isolation makes in-memory locks moot — each invocation is independent. The 5-minute expiry buffer + DB-based token storage is the correct pattern for this concurrency model. Strava access tokens live 6 hours, so refresh is rare in normal usage.

### .zwo Export (pure transform)

```
GET /api/sessions/[id]/export
  → Route Handler: verify session.userId owns sessions.id (else 404)
  → lib/db: SELECT structure_json FROM sessions WHERE id = $1 AND user_id = $2
  → lib/zwo/builder.ts: buildZwo(session) → XML string
  → Response with Content-Type: application/xml, Content-Disposition: attachment
```

### PWA / Service Worker

```
Browser installs SW (public/sw.js, generated by serwist at build)
  → precaches shell assets (nav, today page, fonts)
  → runtime cache: stale-while-revalidate for /api/user/profile, /api/sessions
  → no offline AI generation (requires Anthropic API)
  → today view is readable offline from cache
```

---

## Six Architectural Decisions

### 1. AI Generation: Route Handler, not Server Action

**Decision:** `POST /api/sessions/generate` is a Route Handler.

Server Actions are the right primitive for UI-triggered mutations that stay inside the Next.js process and don't need external callers. AI generation is a long-running HTTP call to an external API with a custom response envelope (the validated session JSON + potential error reasons). Route Handlers give explicit control over error responses, rate-limit headers, and the response shape. Vercel Fluid Compute (enabled by default for new projects) provides up to 60s on Hobby and 800s on Pro — ample for Claude's typical 10–20s response time.

Do not stream the AI response to the client. The session is validated as a unit; partial streaming of unvalidated AI output would bypass the safety gate.

### 2. Strava Token Refresh: Lazy In-Handler, Not a Dedicated Refresh Route

**Decision:** Token refresh happens inside `lib/strava/client.ts`, called from any Strava Route Handler as needed.

In a serverless model, each invocation is isolated — there is no persistent process to hold a lock or a refresh-in-progress flag. A dedicated `/api/strava/refresh` route would require callers to pre-warm tokens, adding round-trips. The lazy pattern (check expiry on every call, refresh if within 5 minutes of expiry, write new tokens back to DB) is simpler, stateless, and correct. The per-user DB row serializes the token state; two concurrent requests that both see an expired token will both attempt refresh, but Strava's token rotation returns valid tokens for both and the last DB write wins — both subsequent requests succeed. This is acceptable at this scale.

### 3. Drizzle Schema: `user_id` on Every Table, Indexed

**Decision:** Every non-`users` table carries `userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })` with an explicit index.

```typescript
// src/lib/db/schema.ts

export const users = pgTable('users', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  goals:        text('goals'),
  ftp:          integer('ftp'),
  weightKg:     numeric('weight_kg'),
  injuryNotes:  text('injury_notes'),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('profiles_user_idx').on(t.userId)]);

export const sessions = pgTable('sessions', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:        text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  structureJson: jsonb('structure_json').notNull(),
  generatedAt:   timestamp('generated_at').defaultNow().notNull(),
  completedAt:   timestamp('completed_at'),
  effortScore:   integer('effort_score'),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const stravaTokens = pgTable('strava_tokens', {
  userId:          text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  athleteId:       text('athlete_id').notNull(),
  // AES-GCM encrypted; format: base64(iv):base64(ciphertext)
  accessTokenEnc:  text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt:       timestamp('expires_at').notNull(),
  scope:           text('scope').notNull().default('activity:read_all'),
}, (t) => [index('strava_tokens_user_idx').on(t.userId)]);

export const stravaActivities = pgTable('strava_activities', {
  id:           text('id').primaryKey(),   // Strava activity ID (string)
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId:    text('session_id').references(() => sessions.id),
  name:         text('name'),
  startDate:    timestamp('start_date'),
  movingTimeS:  integer('moving_time_s'),
  syncedAt:     timestamp('synced_at').defaultNow().notNull(),
}, (t) => [index('strava_activities_user_idx').on(t.userId)]);
```

The load-bearing invariant: every Route Handler query includes `WHERE user_id = $session.userId`. Wrong `user_id` in a query returns no rows, so the response is 404 — never a data leak.

### 4. .zwo Generation: Builder Function with escapeXml, Not Template Literals

**Decision:** A typed builder function in `lib/zwo/builder.ts`, not raw template literals.

User-provided text (session name, description, in-ride messages) can contain `<`, `>`, `&`, `"`, `'` — all XML special characters. A template literal that concatenates these directly produces malformed XML. The correct pattern is a small `escapeXml` helper applied to every string field, called from a builder that constructs the tree from the typed session struct.

```typescript
// src/lib/zwo/builder.ts

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildZwo(session: ValidatedSession): string {
  const blocks = session.blocks.map((b) => {
    switch (b.type) {
      case 'warmup':
        return `<Warmup Duration="${b.durationS}" PowerLow="${b.powerLow}" PowerHigh="${b.powerHigh}" />`;
      case 'steady':
        return `<SteadyState Duration="${b.durationS}" Power="${b.power}" />`;
      case 'intervals':
        return `<IntervalsT Repeat="${b.repeat}" OnDuration="${b.onDurationS}" OffDuration="${b.offDurationS}" OnPower="${b.onPower}" OffPower="${b.offPower}" />`;
      case 'cooldown':
        return `<Cooldown Duration="${b.durationS}" PowerLow="${b.powerLow}" PowerHigh="${b.powerHigh}" />`;
    }
  }).join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<workout_file>
  <name>${escapeXml(session.name)}</name>
  <description>${escapeXml(session.description ?? '')}</description>
  <sportType>bike</sportType>
  <workout>
    ${blocks}
  </workout>
</workout_file>`;
}
```

No XML library needed. The schema is simple and well-documented. The builder is pure (no I/O), trivially testable, and keeps the full output deterministic.

### 5. App Router Folder Structure

```
src/
├── app/
│   ├── layout.tsx                   # root layout: manifest, viewport meta, safe-area
│   ├── page.tsx                     # landing / redirect to /today
│   ├── (auth)/                      # route group — no shared layout
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── onboarding/
│   │   └── page.tsx                 # wizard; guarded by middleware
│   ├── today/
│   │   └── page.tsx                 # on-bike view; guarded
│   ├── history/
│   │   └── page.tsx                 # session list + recharts
│   ├── settings/
│   │   └── page.tsx                 # profile edit, Strava connect/disconnect
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   └── signup/route.ts
│       ├── sessions/
│       │   ├── generate/route.ts
│       │   └── [id]/
│       │       ├── route.ts          # GET session, PATCH effort score
│       │       └── export/route.ts   # .zwo download
│       ├── strava/
│       │   ├── connect/route.ts      # redirect → Strava OAuth
│       │   ├── callback/route.ts     # token exchange + state check
│       │   └── sync/route.ts         # fetch activities, match to sessions
│       └── user/
│           └── profile/route.ts
├── lib/
│   ├── db/
│   │   ├── index.ts                  # neon() client, pooled
│   │   └── schema.ts                 # all Drizzle table definitions
│   ├── ai/
│   │   └── generate.ts               # Anthropic call + Zod validation + safety gate
│   ├── strava/
│   │   └── client.ts                 # token decrypt/refresh + typed fetch wrappers
│   ├── zwo/
│   │   └── builder.ts                # buildZwo() + escapeXml()
│   ├── auth/
│   │   ├── password.ts               # bcrypt hash + verify
│   │   └── rate-limit.ts             # login per-IP + per-account limit
│   ├── session.ts                    # getSession() helper wrapping iron-session
│   └── crypto.ts                     # AES-GCM encrypt/decrypt for Strava tokens
├── components/
│   ├── ui/                           # primitives: Button, Input, Card
│   ├── session/                      # SessionBlock, WattTarget, ExportButton
│   ├── onboarding/                   # wizard steps
│   └── charts/                       # recharts wrappers
└── middleware.ts                     # session guard; matcher covers all except /login, /signup, /api/auth/*
```

**Route group `(auth)/`** keeps login/signup outside the main layout without a URL prefix. The middleware `matcher` excludes `/login`, `/signup`, and `/api/auth/*` so unauthenticated users can reach those routes. All other routes require a valid session.

### 6. PWA / Service Worker: Serwist

**Decision:** Use `@serwist/next` (not `next-pwa`).

The original `next-pwa` repository was archived in August 2023. It requires Webpack and breaks with Turbopack, which is the default bundler in Next.js 16+. Serwist is the actively maintained successor built on Workbox, designed for Next.js App Router. It handles build-time precache manifest injection and generates `public/sw.js` automatically.

Setup is three files:
1. `next.config.ts` — wrap with `withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })`
2. `src/app/sw.ts` — import `@serwist/next/worker`, define cache strategies
3. `src/app/manifest.ts` — Next.js native `MetadataRoute.Manifest` for the web app manifest

Cache strategy for this app:
- **Precache:** App shell, today page, fonts, icons
- **Runtime stale-while-revalidate:** `/api/user/profile`, `/api/sessions` (today can be read offline; stale data beats a blank screen)
- **Network-only (no cache):** `/api/sessions/generate`, `/api/strava/*` (require live connections)

---

## Patterns to Follow

### Session guard in Route Handlers

Every Route Handler that touches user data uses the same guard:

```typescript
import { getSession } from '@/lib/session';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.userId) return new Response(null, { status: 401 });
  // all subsequent DB queries use session.userId
}
```

### Per-user query scoping

Never trust client-supplied IDs. Always scope to `session.userId`:

```typescript
const row = await db.query.sessions.findFirst({
  where: and(eq(sessions.id, params.id), eq(sessions.userId, session.userId)),
});
if (!row) return new Response(null, { status: 404 }); // 404 not 403
```

### Token encryption (Strava)

```typescript
// lib/crypto.ts
const KEY = Buffer.from(process.env.TOKEN_ENC_KEY!, 'base64');

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', KEY, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(plain));
  return `${Buffer.from(iv).toString('base64')}:${Buffer.from(ct).toString('base64')}`;
}
```

---

## Anti-Patterns to Avoid

### Using a Server Action for AI generation

Server Actions post to a Next.js-internal endpoint with limited control over response shape. Error handling surface for rate-limit (429), invalid AI output (422), and safety rejection (400) is cleaner as a Route Handler with explicit status codes.

### In-memory Strava token cache in serverless

In-memory caches are per-process and per-cold-start. In serverless, multiple invocations run in separate processes. Token state must live in the DB, not in module-scope variables. The `refreshInProgress` mutex pattern described in some guides only applies to long-lived Node servers.

### Template literals for XML with user data

Unescaped `<` or `&` in a session name produces XML that Zwift silently rejects or fails to load. The escapeXml function is a one-time write that prevents a hard-to-debug failure at the user's desk.

### Putting `user_id` only on top-level tables

If `sessions` has `user_id` but a child `session_blocks` table only has `session_id`, then a cross-user block fetch requires a JOIN to check ownership on every query. Keep `user_id` on every table. The schema is small; the redundancy is worth it.

### Using `next-pwa` on a new project

Archived, Webpack-only, incompatible with Turbopack. Use Serwist.

---

## Scalability Considerations

| Concern | Now (1–10 users) | Later (100+ users) |
|---------|------------------|--------------------|
| DB connections | Pooled `DATABASE_URL` via `@neondatabase/serverless` (HTTP) — no connection exhaustion | Same driver; Neon autoscales |
| AI cost | Per-user daily rate limit (e.g. 5 generations/day) | Limit tightens; add billing tier checks |
| Strava tokens | Lazy refresh per request; last-write-wins for concurrent refreshes | At high concurrency, introduce a short advisory lock (`SELECT FOR UPDATE` on token row) |
| Rate limiting | Postgres-backed counter (no extra service) | Migrate counter to Upstash Redis if Postgres counter becomes a hot spot |
| PWA cache | Stale-while-revalidate is fine at any scale | No change needed |

---

## Suggested Build Order

Dependencies flow in this order — each phase can only start when the layer below it is stable:

1. **DB schema + Drizzle + Neon connection** — all other components read/write from here
2. **iron-session + auth routes (login/signup/logout) + middleware guard** — every protected page needs this
3. **User profile (onboarding wizard, profile API)** — AI generation reads profile; required before generation
4. **AI generation endpoint + Zod schema + safety gate** — core value; nothing depends on this except export and Strava match
5. **.zwo export** — depends on sessions existing (step 4)
6. **Strava OAuth + token storage + activity sync** — depends on sessions (to match) and crypto (for token encryption)
7. **Progress charts (recharts)** — depends on sessions + Strava activities data being populated
8. **PWA / Serwist service worker** — independent of data layer; add once core screens are stable

---

## Sources

- [Server Actions vs Route Handlers — MakerKit](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)
- [Next.js 15 Server Actions vs Route Handlers — DEV Community](https://dev.to/whoffagents/nextjs-15-server-actions-vs-route-handlers-when-to-use-each-i-got-this-wrong-for-3-months-49hm)
- [Vercel Fluid Compute — Vercel Docs](https://vercel.com/docs/fluid-compute)
- [Fluid Compute for AI workloads — Vercel Blog](https://vercel.com/blog/fluid-compute-evolving-serverless-for-ai-workloads)
- [OAuth Token Management with Strava — Zach Liibbe](https://www.zachliibbe.com/blog/oauth-token-management-with-automatic-refresh-a-strava-api-case-study)
- [Strava API in Next.js — Nicolas Dommanget / Medium](https://nicolas-dmg.medium.com/from-start-to-finish-integrating-strava-api-in-next-js-d08474ff69b7)
- [Drizzle ORM RLS — Drizzle Docs](https://orm.drizzle.team/docs/rls)
- [Drizzle + Neon Postgres — Drizzle Docs](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon)
- [ZWO File Format Reference — GitHub h4l](https://github.com/h4l/zwift-workout-file-reference)
- [Serwist PWA for Next.js — Medium](https://medium.com/@rajesh-biswas/how-i-set-up-a-pwa-in-next-js-app-router-typescript-with-serwist-50f55e698ad5)
- [next-pwa vs Serwist — JavaScript in Plain English](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)
- [iron-session + Next.js App Router — GitHub renchris](https://github.com/renchris/app-router-iron-session)
- [Next.js App Router folder structure — Better Dev / Medium](https://medium.com/better-dev-nextjs-react/inside-the-app-router-best-practices-for-next-js-file-and-directory-structure-2025-edition-ed6bc14a8da3)
