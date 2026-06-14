# Pace

## What This Is

Pace is an AI-assisted cycling training app for serious cyclists. You describe your goals, current fitness, and any injuries; Claude generates a structured interval session; you ride it in Zwift via exported `.zwo` file; Strava auto-matches the completed ride to the plan. The loop is: generate → ride → log.

It is built for public use from day one, deployed with signup locked to the owner while confidence grows, then opened with a feature flag. Multi-user architecture is baked in from the start.

## Core Value

The full loop must work end-to-end: AI generates a session from your profile, you ride it, and it's logged against the plan — all three or none of it matters.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can sign up with email/password and log in with a persistent session
- [ ] User completes an onboarding wizard capturing goals, current fitness, injury notes, and FTP/weight
- [ ] Claude generates a structured interval session from the user's profile and readiness input
- [ ] A deterministic safety gate (backend, outside AI) validates session safety before persisting
- [ ] AI output is validated against a Zod schema; malformed or out-of-bounds sessions are rejected
- [ ] User can view today's session with glanceable watt targets and block structure (on-bike display)
- [ ] User can export the session as a Zwift-compatible `.zwo` file
- [ ] User can log a post-ride readiness/effort score
- [ ] Strava OAuth connects the user's account and auto-matches recent activities to the plan
- [ ] User can view training progress in charts (recharts)
- [ ] App is installable as a PWA with safe-area insets and home-screen launch
- [ ] SIGNUP_ENABLED flag gates public registration; owner account works without it

### Out of Scope

- Native mobile app — web PWA is sufficient and avoids App Store review
- Strava webhooks in v1 — polling a bounded page on connect; webhooks noted as post-v1 upgrade
- Zwift API integration — file drop-in is the interface; no Zwift account auth required
- Garmin / Wahoo export — Zwift `.zwo` only in v1
- Coach/athlete relationship features — single user type; no role hierarchy in v1

## Context

**Tech stack (locked in spec review):** Next.js 14+, TypeScript, Tailwind CSS, Drizzle ORM, Neon Postgres (via Vercel Marketplace native integration, `@neondatabase/serverless` driver), `@anthropic-ai/sdk` (Claude Sonnet 4.6), TanStack React Query, Recharts, iron-session, bcrypt, Zod. Deployed on Vercel (Fluid Compute).

**Strava constraints:** New apps start in single-player mode (owner only). Dashboard upgrade → 10 athletes; beyond 10 requires Strava's review (not guaranteed). The `SIGNUP_ENABLED` flag has this external ceiling in front of it. Strava brand compliance (official "Connect with Strava" button, Developer Program form with screenshots) is mandatory for any access increase.

**Neon cold starts:** Neon scales to zero; first query after idle pays a cold-start penalty. Vercel serverless can exhaust Postgres connection limits under concurrency. Use the pooled `DATABASE_URL` for app queries; `DATABASE_URL_UNPOOLED` for migrations only.

**Security baseline:** bcrypt passwords, httpOnly signed cookies (`Secure`, `SameSite=Lax`), per-user query scoping as the load-bearing invariant, 404 (not 403) on cross-user IDs, read-only Strava scope. Strava tokens encrypted at rest with `TOKEN_ENC_KEY` (AES-GCM). Login rate-limited (per-IP and per-account). CSRF protection on state-changing routes; mandatory cryptographic `state` check on the Strava OAuth callback. Per-user rate limit on AI generation endpoint.

**AI prompt safety:** User-controlled free text (`injury_notes`, session `notes`) is treated as data, placed in a delimited block, never as instructions. Post-generation schema+safety validation is authoritative — model output shape is never trusted directly.

**Mobile/PWA:** Primary use case is on-bike mid-effort at arm's length. Today view: very large watt target numeral, 48×48px minimum touch targets, high-contrast palette, no hover-dependent interactions. Forms use tap-selectors (not free-type) for readiness/effort. Inputs ≥16px to prevent iOS auto-zoom. `dvh`/`svh` sizing. `viewport-fit=cover` with `env(safe-area-inset-*)`. Web app manifest + apple-touch-icon.

## Constraints

- **Tech stack:** Next.js + Neon + Vercel — decided in spec review, not up for revision
- **Strava API:** 100 req/15min, 1,000/day read limits; fetch a bounded page (≤30 activities), handle 429 with backoff, surface retry state in UI
- **Strava access:** Single-player until dashboard upgrade; ≤10 athletes until Strava review; brand button required
- **AI cost:** Per-token spend on generation; per-user daily rate limit to protect the bill
- **Security:** No secrets in client bundles — verified at Phase 0 as a truth-condition; CSP header set via Next config

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full loop as core value (generate → ride → log) | Partial loops have no standalone utility | — Pending |
| Multi-user architecture from Phase 0 | "Public from day one" means retrofitting is not an option | — Pending |
| SIGNUP_ENABLED flag off at launch | Controlled rollout; Strava single-player mode enforces it anyway | — Pending |
| Neon Postgres (not Vercel Postgres) | Vercel Postgres discontinued Dec 2024; Neon is the successor | — Pending |
| `@neondatabase/serverless` driver | Designed for serverless/HTTP, avoids connection exhaustion | — Pending |
| Strava tokens encrypted at rest | Multi-user means a refresh token breach affects real accounts | — Pending |
| Zod validation on AI output | Model output shape is untrusted; schema is the authority | — Pending |
| FTP is optional | Complete beginners and injury-recovery users can't test FTP; app generates RPE-based sessions without it; FTP adds later | — Pending |
| PWA (not native app) | On-bike use case needs home-screen launch; App Store review is unnecessary friction | — Pending |
| No Strava SDK (direct fetch) | Keeps dependency surface small; SDK is not needed at this call volume | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 after initialization*
