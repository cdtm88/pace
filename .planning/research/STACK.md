# Technology Stack

**Project:** Pace — AI-assisted cycling training app
**Researched:** 2026-06-14
**Overall confidence:** MEDIUM (npm versions verified; web findings cross-checked)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | **16.2.9** | App Router, RSC, API routes, PWA shell | Current stable; Turbopack default; Vercel-native. Use 16, not 15 — the spec says "14+" but 16 is stable since Oct 2025. |
| React | **19.2** | UI rendering | Ships with Next.js 16; React Compiler available stable if needed. |
| TypeScript | **5.7+** | Type safety | Next.js 16 requires TS ≥5.1; use 5.7 for const type param improvements. |
| Node.js | **20.9+ (LTS)** | Runtime | Next.js 16 **drops Node 18** — minimum is 20.9.0 LTS. Critical constraint. |

**Next.js 16 migration notes for greenfield:**
- No `middleware.ts` — use `proxy.ts` from day one (middleware is deprecated).
- Caching is explicit via `"use cache"` directive + `cacheComponents: true` in config; no implicit route-level caching.
- `revalidateTag()` requires a second `cacheLife` profile argument (`'max'` recommended).
- `cookies()`, `headers()`, `params` are all async — `await` them everywhere.
- Turbopack is the default bundler; webpack only if you have a custom config that requires it.
- `next lint` command removed — run ESLint directly in CI.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Neon Postgres | via Vercel Marketplace | Primary data store | The spec correctly names this; Vercel Postgres was retired Dec 2024. Neon is the successor with native Vercel integration. |
| `@neondatabase/serverless` | **1.1.0** | Postgres driver | HTTP-based, no TCP connection held open. Designed for serverless cold-start environments. Required for Vercel. |
| Drizzle ORM | **0.45.2** | Schema, queries, type safety | Type-safe, thin, and native Neon-HTTP support via `drizzle-orm/neon-http`. Migration tool is `drizzle-kit`. |
| drizzle-kit | **0.31.10** | Schema migrations | Use `DATABASE_URL_UNPOOLED` for migrations; pooled URL for app runtime queries. |

**Drizzle + Neon pattern:**
```ts
// lib/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

Use `drizzle-orm/neon-http` (HTTP transport) for all app queries. Only use `neon-serverless` WebSocket variant if you need interactive transactions — rare for this app's read/write patterns.

---

### Authentication & Sessions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `iron-session` | **8.0.4** | Session management | Correct choice. Stateless signed cookies, zero external service, works with RSC + Server Actions via `getIronSession(await cookies(), ...)`. Auth.js (NextAuth) team now recommends Better-Auth for new projects, but iron-session is the right fit here because Pace builds its own email/password auth with no OAuth sign-in. |
| `bcryptjs` | **3.0.3** | Password hashing | Use `bcryptjs` (pure JS), NOT the native `bcrypt` or `argon2` packages. Vercel serverless has documented native binding issues with both. `bcryptjs` avoids node-gyp entirely and is sufficient at cost factor 12. Argon2id is the stronger algorithm (OWASP first choice), but `@node-rs/argon2` (Rust prebuilds) has reported loading failures on Vercel. Stick with `bcryptjs` unless Argon2 is explicitly tested on the Vercel target. |

**DO NOT use:**
- `next-auth` / `Auth.js` — built for OAuth-first flows; heavy dependency for a custom email+password setup. Auth.js team's own recommendation for new projects now points to Better-Auth.
- `lucia` — v3 refactored to a reference implementation (no longer a usable npm package in the traditional sense; requires you to implement your own session store).
- `better-auth` — good library, but adds ~1.6MB dependency and conventions for a use case that iron-session handles in ~50 lines.
- Native `bcrypt` — native node-gyp compilation; documented Vercel deployment failures.
- `argon2` (npm) — same node-gyp issue on Vercel.

---

### AI Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | **0.104.1** | Claude API client | Official SDK. Use `claude-sonnet-4-6` model as specified. Server-side only — the API key must never reach the client bundle. |

**Pattern for structured output:**
Use the SDK's `messages.create` with `response_format` or tool-use JSON mode. Always pipe through Zod schema validation before writing to DB — model output shape is never trusted directly (spec's requirement, correct).

---

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | **4.4.3** (v4, `latest`) | Request validation, AI output schema | Zod v4 is now `latest` on npm (stable since mid-2025). 14× faster parsing than v3, 57% smaller core. **Breaking changes from v3** — see below. |

**Zod v4 breaking changes that matter for this project:**
- `z.string().email()` → `z.email()` (top-level function).
- `z.string().uuid()` → `z.uuid()` (now enforces RFC 4122; stricter).
- `error.errors` → `error.issues`.
- `z.record()` key typing changed.

If the codebase is greenfield, start on v4. If there's any existing v3 code, use `import { z } from 'zod/v3'` subpath during migration.

---

### Client-Side Data Fetching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@tanstack/react-query` | **5.101.0** | Client-side caching, server hydration | Correct choice. v5 supports SSR hydration with Next.js App Router via `HydrationBoundary` + `dehydrate()`. Needed for Strava polling state, session display, chart data. |

**Pattern for App Router:**
```tsx
// app/providers.tsx (client component)
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Wrap layout in a client-side provider — QueryClientProvider cannot be in RSC.
```

For server-prefetched data (e.g. today's session), use `prefetchQuery` in a Server Component and hydrate on the client. For Strava polling with retry-on-429, React Query's retry + `retryDelay` is purpose-built.

---

### Charts

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `recharts` | **3.8.1** | Training progress charts | Correct choice. ~150kB, 2.4M weekly downloads, SVG-based, declarative React API, `ResponsiveContainer` handles narrow mobile widths. v3 is the current stable. |

**DO NOT use:**
- Tremor — built on Recharts; adds abstraction without adding value for custom cycling-metric charts. ~200kB overhead.
- Nivo — 500kB+ bundle; server-side rendering capability not needed here; overkill.
- Chart.js (via react-chartjs-2) — canvas-based; worse accessibility, harder to style in Tailwind.

---

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | **4.x** | Utility-first CSS | Next.js 16's `create-next-app` template defaults to Tailwind. v4 uses a CSS-first config (no `tailwind.config.js` required). Use `@import "tailwindcss"` in globals.css. |

**Note:** Tailwind v4 changes configuration from JS to CSS. If the spec was written assuming v3 config syntax, update `tailwind.config.js` patterns to the v4 CSS `@theme` approach. `dvh`/`svh` units and `env(safe-area-inset-*)` work natively in Tailwind v4 utilities.

---

### PWA

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@serwist/next` | **9.5.11** | Service worker, PWA manifest | `next-pwa` is unmaintained and incompatible with Next.js App Router. Serwist is the maintained successor (Workbox-based), with explicit App Router support and a `withSerwist` Next.js config wrapper. |

**DO NOT use:**
- `next-pwa` — unmaintained; breaks with App Router.
- `@ducanh2912/next-pwa` — fork maintained by community but Serwist has broader adoption and is better documented for App Router + Next.js 16.

**PWA setup pattern:**
```ts
// next.config.ts
import withSerwist from '@serwist/next';

export default withSerwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig);
```

---

### Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@upstash/ratelimit` | **2.0.8** | Login throttling, AI generation limit | Purpose-built for stateless serverless. HTTP-based Redis; no persistent connection needed. Officially recommended in Next.js docs for rate limiting. Requires an Upstash Redis instance (free tier sufficient). |

**Alternative (no external service):** A Postgres-backed counter table works but adds latency and connection pressure on Neon. Upstash is the cleaner choice.

**Environment variables if using Upstash:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vitest` | latest | Unit + integration tests | Faster than Jest, native ESM support, compatible with `@testing-library/react`. |
| `@testing-library/react` | latest | Component tests | For on-bike UI (Today view), onboarding wizard, PWA install prompt. |
| `msw` | v2 | API mocking | Mock Anthropic and Strava in integration tests. v2 is the current stable; `setupWorker` for browser, `setupServer` for Node. |

---

### CI / Tooling

| Technology | Purpose | Notes |
|------------|---------|-------|
| ESLint (direct) | Linting | `next lint` command removed in Next.js 16. Run `eslint` directly. ESLint v9 flat config format is the default. |
| Prettier | Formatting | — |
| `npm audit` | Dependency security | Pin versions; run in CI. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth | iron-session | better-auth | Overkill for email+password only; iron-session is 50 lines vs full library |
| Auth | iron-session | next-auth / Auth.js | OAuth-centric; heavy for custom credential flow; team now recommends Better-Auth anyway |
| Auth | iron-session | lucia v3 | Now a reference implementation, not a usable library |
| Password | bcryptjs | argon2 / @node-rs/argon2 | Native binding issues on Vercel; bcryptjs is pure JS, no node-gyp |
| Password | bcryptjs | native bcrypt | Same native binding problem on Vercel serverless |
| Charts | recharts | tremor | Adds abstraction built on Recharts; not worth the overhead |
| Charts | recharts | nivo | 500kB+; SSR feature not needed |
| PWA | @serwist/next | next-pwa | next-pwa unmaintained; App Router incompatible |
| Rate limit | @upstash/ratelimit | postgres counter | More latency; adds connection pressure on Neon |
| Validation | zod v4 | zod v3 | v4 is now `latest`; 14× faster; greenfield should start on v4 |

---

## Full Dependency Install

```bash
# Core framework
npm install next@latest react@latest react-dom@latest

# Database
npm install @neondatabase/serverless drizzle-orm
npm install -D drizzle-kit

# Auth & security
npm install iron-session bcryptjs
npm install -D @types/bcryptjs

# AI
npm install @anthropic-ai/sdk

# Validation
npm install zod

# Client data
npm install @tanstack/react-query

# Charts
npm install recharts

# Styling
npm install tailwindcss

# PWA
npm install @serwist/next serwist

# Rate limiting
npm install @upstash/ratelimit @upstash/redis

# Testing
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom msw

# Linting
npm install -D eslint prettier typescript
```

---

## Environment Variables (Authoritative List)

Required (app crashes if missing):
- `DATABASE_URL` — pooled Neon URL (app queries)
- `DATABASE_URL_UNPOOLED` — direct Neon URL (migrations only)
- `SESSION_SECRET` — iron-session cookie encryption key (≥32 random bytes)
- `TOKEN_ENC_KEY` — AES-GCM key for Strava token encryption at rest
- `ANTHROPIC_API_KEY` — Claude API key (server-side only, never in client bundle)
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `SIGNUP_ENABLED` — `"true"` or `"false"`
- `APP_BASE_URL` — full origin, e.g. `https://pace.app` (Strava OAuth callback)

Optional (rate limiting):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

---

## Critical Version Constraints Summary

| Constraint | Impact |
|------------|--------|
| Node.js ≥20.9.0 | Next.js 16 hard requirement — Node 18 is dropped |
| `proxy.ts` not `middleware.ts` | Renamed in Next.js 16; start with proxy.ts from day one |
| Zod v4 breaking API changes | `z.email()` not `.email()`, `error.issues` not `.errors` |
| `cookies()`/`headers()` are async | Must `await` in all Next.js 16 Server Components and Actions |
| `bcryptjs` not `bcrypt`/`argon2` | Vercel native-binding deployment failures with C++ deps |
| `@serwist/next` not `next-pwa` | next-pwa is unmaintained and App Router incompatible |
| `DATABASE_URL` not `POSTGRES_URL` | Neon Marketplace integration injects this name |
| Explicit `"use cache"` directive | Next.js 16 implicit caching removed; opt-in only |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| npm versions | HIGH | Verified with `npm show` at research time |
| Next.js 16 breaking changes | HIGH | Sourced from official nextjs.org/blog/next-16 |
| iron-session v8 App Router compat | MEDIUM | Confirmed via GitHub release notes and community usage |
| bcryptjs on Vercel | MEDIUM | Documented pattern; argon2 failures confirmed in GitHub issues |
| Serwist as next-pwa successor | MEDIUM | Community consensus; multiple guides; active maintenance confirmed |
| @upstash/ratelimit recommendation | MEDIUM | Listed in Next.js official docs; widely used pattern |
| Zod v4 production stability | MEDIUM | `latest` tag on npm; released mid-2025; cross-checked with changelog |
| better-auth / Auth.js team merger | MEDIUM | Sep 2025 announcement; confirmed via multiple sources |

---

## Sources

- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — official, HIGH confidence
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — official
- [Drizzle + Neon docs](https://orm.drizzle.team/docs/connect-neon) — official
- [Zod v4 changelog](https://zod.dev/v4/changelog) — official
- [TanStack Query v5 SSR guide](https://tanstack.com/query/v5/docs/framework/react/guides/ssr) — official
- [Serwist + Next.js guide](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7) — community, MEDIUM
- [Argon2 Vercel issue thread](https://github.com/vercel/next.js/discussions/65978) — GitHub, MEDIUM
- [iron-session v8 release](https://github.com/vvo/iron-session/releases/tag/v8.0.0) — official repo
- [Auth.js → Better-Auth transition](https://blog.logrocket.com/best-auth-library-nextjs-2026/) — LogRocket, MEDIUM
- [bcrypt vs argon2 for serverless](https://www.pkgpulse.com/compare/argon2-vs-bcrypt) — community, MEDIUM
- [Recharts vs alternatives](https://blog.logrocket.com/best-react-chart-libraries-2026/) — LogRocket, MEDIUM
- [Upstash ratelimit](https://upstash.com/blog/nextjs-ratelimiting) — official Upstash, MEDIUM
