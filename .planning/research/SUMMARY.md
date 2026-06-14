# Project Research Summary

**Project:** Pace — AI-assisted cycling training app
**Domain:** Structured interval training with AI generation and platform integrations
**Researched:** 2026-06-14
**Confidence:** HIGH

## Executive Summary

Pace is a full-loop training app (generate → ride → log) built on Next.js 16 / Neon / Vercel with Claude as the generation engine and Strava as the completion log. The domain is well-understood — TrainerRoad, Wahoo SYSTM, and JOIN all exist — but none of them generate sessions from free-text goals with injury context. The differentiator is conversational AI input plus end-to-end Strava auto-match. The spec's feature set is well-chosen and needs one addition: per-block power zone labels (Z2, Z4, VO2max), which every competing app shows because zone language is how cyclists reason about effort.

The stack is sound but the spec referenced outdated versions. Key corrections: Next.js 16 (not 14+), Node 20.9+ (16 drops Node 18), `middleware.ts` renamed to `proxy.ts`, `next-pwa` replaced by `@serwist/next`, Zod is now v4 with breaking API changes, and `bcryptjs` must replace `bcrypt`/`argon2` due to Vercel native-binding failures. Architecture is standard App Router: Server Components for data-fetching, Route Handlers for mutations and AI, TanStack Query for client-side polling state. No exotic patterns needed.

The three highest-risk areas are: (1) multi-user data isolation via Drizzle WHERE clauses (IDOR if mishandled), (2) Strava token refresh race conditions, and (3) Claude API rate limits at Tier 1. All three have clear mitigations that must be designed in from Phase 0 — they cannot be bolted on later without invasive rewrites.

## Key Findings

### Recommended Stack

The spec's stack is directionally correct but needs version corrections. Start on Next.js 16, use `proxy.ts` not `middleware.ts`, use `@serwist/next` for PWA, `bcryptjs` not `bcrypt`, and Zod v4 (breaking: `z.email()` not `z.string().email()`, `error.issues` not `error.errors`).

**Core technologies:**
- **Next.js 16 + React 19** — App Router, RSC, Route Handlers, Turbopack default; requires Node 20.9+
- **Neon Postgres + `@neondatabase/serverless`** — HTTP driver avoids serverless connection exhaustion; pooled URL for app, unpooled for migrations only
- **Drizzle ORM 0.45.2** — type-safe, native Neon-HTTP; `drizzle-kit` for migrations
- **iron-session 8.0.4** — stateless signed cookies; correct for custom email/password auth with no OAuth
- **`bcryptjs` 3.0.3** — pure JS; no node-gyp; `bcrypt` and `argon2` both have documented Vercel failures
- **`@anthropic-ai/sdk` 0.104.1** — server-side only; `claude-sonnet-4-6`; non-streaming for structured output
- **Zod v4** — validate AI output schema; `powerFraction` field must be float [0.1, 1.8], never raw watts
- **TanStack React Query v5** — client polling for Strava sync state; SSR hydration via `HydrationBoundary`
- **Recharts 3.8.1** — weekly TSS bar chart; `ResponsiveContainer` handles narrow mobile widths
- **`@serwist/next` 9.5.11** — PWA; replaces archived `next-pwa` (Turbopack-incompatible)
- **`@upstash/ratelimit`** — per-user AI generation limit and login throttling; HTTP Redis
- **Tailwind CSS v4** — CSS-first config; `dvh`/`svh` and `env(safe-area-inset-*)` native

### Expected Features

**Must have (table stakes):**
- FTP capture and storage — every watt target is expressed as % FTP; unitless without it
- Power zone label per session block — Z1–Z7 Coggan derived from FTP; every competing app shows this; **missing from spec** (critical gap)
- Structured block list with duration and estimated TSS — users need to know if the session fits their time
- Post-ride completion log with RPE — minimum feedback loop
- Session history (chronological ride log)
- Glanceable on-bike Today view — very large watt numeral, 48px touch targets
- `.zwo` export — only path from generated session to Zwift
- PWA installability — home-screen launch for on-bike use case
- Strava OAuth + auto-match — closes the generate→ride→log loop; strongest retention hook

**Should have (differentiators):**
- Conversational AI generation from free-text goals — no competing app does this
- Injury-aware session modification — `injury_notes` fed into prompt
- Readiness-adjusted intensity — pre-ride 0–3 score modifies generated session
- Session safety gate (deterministic, outside AI) — hard bounds on watts and duration; makes AI trustworthy
- Full generate→ride→log loop with Strava auto-match — the UX payoff that validates the core value

**Defer (v2+):**
- CTL/ATL/TSB form chart — weeks of data needed to be meaningful; raw TSS bar chart is enough
- HRV / wearable sync — high integration cost; subjective readiness (0–3) is an adequate proxy
- Multi-week training calendar — a separate product; single-session generation first
- Strava webhooks — polling a bounded page is sufficient for single-player mode
- Garmin / Wahoo export — Zwift `.zwo` only in v1

### Architecture Approach

Standard Next.js App Router with a clean service layer. Server Components read from DB directly via `lib/db`; Route Handlers handle all mutations, AI calls, and OAuth; TanStack Query manages client-side polling state. The load-bearing invariant: every DB query includes `WHERE user_id = session.userId`. AI generation is a Route Handler (not Server Action) for explicit control over error codes and to avoid RSC streaming/cookie interaction bugs.

**Build order (hard dependency chain):**
1. **DB schema + Drizzle + Neon** — everything reads/writes from here
2. **Auth (iron-session + login/signup/logout + middleware guard)** — every protected route needs this
3. **User profile + onboarding wizard** — AI generation reads FTP, goals, injury notes
4. **AI generation + Zod schema + safety gate** — core value; prompt caching architecture designed here
5. **.zwo export** — depends on sessions existing
6. **Strava OAuth + token storage + activity sync** — depends on sessions (to match) and `lib/crypto`
7. **Progress charts** — depends on sessions + Strava activity data
8. **PWA / Serwist** — independent of data layer; add once core screens are stable

**Major components:**
1. `src/middleware.ts` — session presence check; redirects unauthenticated users
2. `src/app/api/sessions/generate/route.ts` — rate-check → AI → Zod → safety gate → persist
3. `lib/ai/generate.ts` — Anthropic SDK; Zod validation; rejects malformed/out-of-bounds output
4. `lib/strava/client.ts` — lazy token refresh per request; AES-GCM decrypt; typed fetch wrappers
5. `lib/zwo/builder.ts` — pure builder with `escapeXml()`; no I/O; independently testable
6. `lib/db/schema.ts` — all tables carry `user_id` FK + index; cascade delete on user removal

### Critical Pitfalls

1. **Multi-user IDOR via Drizzle WHERE clause override (Phase 0)** — Calling `.where()` twice silently drops the first clause. Always compose with `and(eq(table.userId, session.userId), eq(table.id, resourceId))`. Return 404 not 403.

2. **Strava refresh token race condition (Phase 5)** — Rolling single-use refresh tokens: two concurrent requests seeing an expired token both attempt refresh; the second gets a 401 and permanently breaks the stored token. Prevention: 10-minute expiry buffer, atomic token write, 401 = "disconnected — reconnect" signal in UI.

3. **Claude Tier 1 ITPM ceiling (Phase 3)** — 30,000 ITPM; a full-profile prompt is 2,000–4,000 tokens, leaving ~7–15 generations/minute before binding. Prevention: static system prompt as cached block via `cache_control: {type: "ephemeral"}`; dynamic user data in human turn after cache breakpoint. Per-user daily limit (3–5/day) as cost + throughput floor.

4. **ZWO power values as watts instead of FTP fractions (Phase 3/4)** — If AI outputs `"power": 240` (watts) and the builder treats it as a fraction, the workout is 240×FTP. Zwift silently accepts it. Zod schema must enforce `powerFraction: number` in `[0.1, 1.8]`; builder must only accept `powerFraction`.

5. **iron-session cookie dropped on redirect (Phase 0/1)** — Cannot `Set-Cookie` and `NextResponse.redirect()` in same response. Login pattern: Route Handler POST → save session → return 200 → client JS handles redirect. Never `session.save()` in Server Components or RSC.

## Implications for Roadmap

### Phase 0: Foundation (DB, auth, security baseline)
**Rationale:** Auth and multi-user scoping must exist before any feature code. Security baseline (secret hygiene, IDOR prevention, cookie pattern) cannot be retrofitted.
**Delivers:** Signup/login/logout, iron-session cookie, middleware guard, Drizzle schema with `user_id` on every table, CI check for secret exposure.
**Avoids:** IDOR (Pitfall 4), cookie/redirect bug (Pitfall 5), secret exposure (Pitfall 15)
**Research flag:** Standard patterns — skip research phase

### Phase 1: User Profile + Onboarding
**Rationale:** AI generation reads FTP, goals, weight, and injury notes. Power zone derivation (Coggan Z1–Z7) also lives here — pure calculation from FTP that feeds every session view and closes the spec gap.
**Delivers:** Onboarding wizard, profile API, FTP storage, Coggan zone calculation utility.
**Addresses:** FTP table stake, power zone label gap, injury-aware generation differentiator.
**Research flag:** Standard patterns — skip research phase

### Phase 2: AI Session Generation + Safety Gate
**Rationale:** Core product value. Prompt caching architecture must be designed here — retrofitting later requires restructuring the prompt and can bust cached calls.
**Delivers:** `POST /api/sessions/generate`, Zod output schema with `powerFraction`, deterministic safety gate (define numeric bounds before planning), per-user rate limit, `maxDuration: 60` on route.
**Avoids:** Tier 1 rate limit (Pitfall 6), prompt cache miss (Pitfall 12), watts vs. fractions (Pitfall 14), function timeout (Pitfall 10).
**Research flag:** Needs attention — prompt caching architecture, Zod output schema, safety gate bound definitions

### Phase 3: Today View + .zwo Export
**Rationale:** Generated sessions have no path to the bike without Today view and export. Both surfaces are built together because they share the session data model.
**Delivers:** Today view (large watt numeral, block list with zone labels, 48px touch targets), `.zwo` export handler, `buildZwo()` with `escapeXml()`, unit tests for all block types.
**Avoids:** ZWO silent Zwift rejection (Pitfall 7), XML injection.
**Research flag:** Standard patterns — skip research phase

### Phase 4: Post-Ride Log + Session History
**Rationale:** Minimum feedback loop. Closes the memory gap; data feeds progress charts in Phase 6.
**Delivers:** Post-ride log (RPE + effort score), session history list (chronological, TSS + date), TSS estimation from block structure.
**Research flag:** Standard patterns — skip research phase

### Phase 5: Strava OAuth + Auto-Match
**Rationale:** The payoff of the generate→ride→log loop. Requires sessions (to match against) and `lib/crypto` (for token encryption). Most complex integration — Strava edge cases are numerous.
**Delivers:** OAuth flow with `state` CSRF check, scope verification on callback (reject if `activity:read` absent), AES-GCM token encryption, lazy per-request refresh, bounded activity fetch (`per_page=30`), session auto-match, "reconnect Strava" UI on 401.
**Avoids:** Token refresh race (Pitfall 2), scope narrower than requested (Pitfall 3), 429 polling (Pitfall 11).
**Research flag:** High complexity — review PITFALLS.md Phase 5 warnings in full before planning

### Phase 6: Progress Charts
**Rationale:** Requires completed sessions with TSS values from Phase 4 and optionally Strava data from Phase 5.
**Delivers:** Weekly TSS bar chart (recharts `ResponsiveContainer`, 6-week rolling window), session history with Strava activity links.
**Avoids:** CTL/ATL over-engineering (anti-feature).
**Research flag:** Standard patterns — skip research phase

### Phase 7: PWA + Polish
**Rationale:** Add last when core screens are stable; service worker precache lists must not churn during active development.
**Delivers:** `@serwist/next` service worker, web app manifest, apple-touch-icon, `viewport-fit=cover`, offline Today view via stale-while-revalidate, graceful offline screen.
**Avoids:** `next-pwa` (archived/incompatible), iOS 7-day storage eviction (Pitfall 8), EU standalone mode loss (Pitfall 9).
**Research flag:** Standard patterns — skip research phase

### Phase Ordering Rationale

- Phases 0–1 are prerequisites for everything: no feature works without auth and profile
- Phase 2 (AI) precedes export and Strava because both depend on sessions existing
- Phase 3 (Today + export) precedes logging: export is the bridge to the actual ride
- Phase 5 (Strava) precedes charts because auto-match data enriches the history view
- PWA is last: precache manifest must be stable before committing to service worker cache

### Research Flags

Needs deeper research during planning:
- **Phase 2 (AI generation):** Prompt caching structure (1,024 token minimum), Zod output schema for `powerFraction`, safety gate numeric bounds (max duration, max watt ceiling as % FTP)
- **Phase 5 (Strava):** Token refresh concurrency handling, scope verification flow, 429 backoff pattern

Standard patterns (skip research-phase):
- Phase 0, 1, 3, 4, 6, 7 — all well-documented with established patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm versions verified at research time; Next.js 16 changes from official nextjs.org/blog |
| Features | HIGH | Domain well-established; competitor analysis grounded in real apps (TrainerRoad, JOIN, Spoked) |
| Architecture | HIGH | Patterns from official Next.js, Drizzle, Vercel, iron-session docs; no speculation |
| Pitfalls | HIGH | Items 1–6 validated against official docs + GitHub issues; iOS Safari behavior is MEDIUM |

**Overall confidence:** HIGH

### Gaps to Address

- **Power zone labels:** Not mentioned in the spec. Must be added to Phase 1 and Phase 3 requirements before planning. Pure function of FTP — no additional data needed.
- **Safety gate bounds:** Spec references "deterministic safety gate" without defining numeric bounds. Define before Phase 2 planning. Suggested baseline: `powerFraction` ≤ 1.5, total session ≤ 4 hours, individual block ≤ 90 minutes.
- **Prompt minimum token size:** System prompt must be ≥1,024 tokens for `cache_control` to be honored. Validate and pad with static content (zone definitions, safety rules, output schema) if shorter. Confirm at Phase 2 planning.
- **Strava single-player ceiling:** `SIGNUP_ENABLED` flag is an internal gate, but Strava's Dashboard upgrade is the hard external ceiling (10 athletes before their review, not guaranteed). Roadmap must note this as a hard user growth constraint independent of the flag.

## Sources

### Primary (HIGH confidence)
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — breaking changes: Node 20 minimum, proxy.ts, async cookies/headers, explicit caching
- [Drizzle + Neon docs](https://orm.drizzle.team/docs/connect-neon) — HTTP driver setup, pooled vs. unpooled URL
- [Zod v4 changelog](https://zod.dev/v4/changelog) — breaking API changes from v3
- [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) — Tier 1: 50 RPM, 30K ITPM for Sonnet 4.x
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — 1,024 token minimum, 5-minute TTL
- [Strava Authentication docs](https://developers.strava.com/docs/authentication/) — rolling refresh tokens, 6-hour expiry, scope opt-out
- [ZWO file format reference](https://github.com/h4l/zwift-workout-file-reference) — element structure, power as FTP fraction
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute) — function duration limits, TCP connection reuse

### Secondary (MEDIUM confidence)
- [Serwist + Next.js guide](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7) — next-pwa replacement
- [iron-session v8 release notes](https://github.com/vvo/iron-session/releases/tag/v8.0.0) — App Router compatibility
- [Drizzle $dynamic WHERE drop bug](https://github.com/drizzle-team/drizzle-orm/issues/2321) — confirmed issue in certain versions
- [Next.js cookie/redirect discussion](https://github.com/vercel/next.js/discussions/48434) — cannot Set-Cookie + redirect in same response
- [MagicBell PWA iOS limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 7-day eviction, EU standalone removal
- [Argon2 Vercel issue](https://github.com/vercel/next.js/discussions/65978) — native binding failures on Vercel serverless
- TrainerRoad, JOIN, Spoked, Intervals.icu — competitor feature analysis

---
*Research completed: 2026-06-14*
*Ready for roadmap: yes*
