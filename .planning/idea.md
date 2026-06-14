# Deep Review: Pace Build Spec

This is a critical pre-build review of the Pace spec. It is organised as: verdict, must-fix issues (blocking), should-fix issues (do before the relevant phase), the full dependency and third-party API register, security findings, and the mobile-responsive requirements that the spec currently under-specifies. Where something is already right, it is not restated; this document is the diff between "good spec" and "ready to build."

---

## Verdict

The spec is structurally sound: the multi-tenant-from-day-one decision, the deterministic safety gate sitting outside the AI, the goal/injury data living in the profile rather than in code, and the GSD phase decomposition with goal-backward truth-conditions are all correct and worth keeping exactly as they are. There are, however, several factual staleness issues in the dependency choices and some genuine gaps in security, rate-limit handling, and mobile UX that should be fixed before the relevant phases start. None are architecture-breaking. The biggest single correction is that the named database product no longer exists.

---

## Must-fix (blocking, correct in the spec before Phase 0)

### 1. "Vercel Postgres" is discontinued; rename to Neon
Vercel Postgres was retired and existing databases were migrated to Neon in December 2024. For new projects you now install a Postgres integration (Neon) from the Vercel Marketplace, and the old `@vercel/postgres` driver is deprecated in favour of the `@neondatabase/serverless` driver. Action: everywhere the spec says "Vercel Postgres (Neon)", say "Neon Postgres (via the Vercel Marketplace native integration)". Use `@neondatabase/serverless` as the driver, or let Drizzle talk to it via the `drizzle-orm/neon-http` (or `neon-serverless`) adapter. The integration injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct); the spec's env var should be `DATABASE_URL`, not `POSTGRES_URL`.

### 2. Serverless + Neon cold start and connection handling
Neon scales to zero, so the first query after idle pays a cold-start penalty, and Vercel serverless functions can each open their own connection, which exhausts Postgres connection limits under any concurrency. This is a classic footgun, not a theoretical one. Action: use the pooled `DATABASE_URL` for the app, use the HTTP/serverless driver (designed for this), and for migrations use the unpooled direct URL. Add a one-line note in the architecture section. For a single user this rarely bites, but Phase 7 (multi-user) makes it real, so bake it in now rather than retrofit.

### 3. Strava "single-player mode" caps multi-user harder than your own flag does
New Strava apps start in single-player mode: only the owner's Strava account can authenticate. Upgrading in the dashboard raises capacity to 10 athletes; beyond 10 requires submitting the app for Strava's review, which is not guaranteed. This means the Strava integration has its own access ceiling that sits in front of `SIGNUP_ENABLED`. Even with the flag on, you cannot onboard an 11th Strava-connected user without Strava's approval. Action: document this in A6 and in Phase 7's notes as an external constraint. It does not change the build, but it changes expectations and must not be discovered at flip-the-flag time.

### 4. Strava brand-compliance and Developer Program review are mandatory, not optional
Strava requires a "Connect with Strava" button using their official asset, adherence to their brand guidelines, and completion of a Developer Program form (with screenshots of every place Strava data is displayed) for any access increase. The API agreement was last revised on 1 June 2026, so it must be read fresh at build time. Action: add a Phase 5 truth-condition that the Strava connect entry point uses the official "Connect with Strava" button asset, and add a README task to complete the Developer Program form before multi-user.

---

## Should-fix (address during the named phase)

### 5. Strava rate limits and the auto-match fetch (Phase 5)
Default read limits are 100 requests / 15 min and 1,000 / day; overall 200 / 15 min and 2,000 / day, returning 429 when exceeded, and over-limit requests still count toward the daily total. The spec's "fetch recent activities and auto-match" must therefore fetch a single bounded page (for example the last 30 activities via one `GET /athlete/activities?per_page=30` call), never loop or backfill history. Add: respect the `X-RateLimit-Usage`/`X-RateLimit-Limit` response headers, handle 429 with a backoff-and-retry-later that surfaces a "couldn't reach Strava, tap to retry" state rather than failing the session log. Longer term the correct pattern is a Strava webhook subscription (push on new activity) instead of polling; note it as the post-v1 upgrade for the auto-pull, since it removes almost all read traffic.

### 6. Token storage is plaintext; encrypt Strava tokens at rest (Phase 5)
The schema stores Strava `access_token` and `refresh_token` as plain `TEXT`. The spec's own comment calls encryption "overkill for single-user," but the whole point of this revision is multi-user readiness, and a refresh token is a long-lived credential to a third party's account. Action: encrypt both token columns with an app-level key (`TOKEN_ENC_KEY` env var, AES-GCM via Node `crypto`), decrypt only in the Strava service. Cheap to add now, painful to retrofit across a populated table later.

### 7. The AI prompt is an injection surface; constrain its inputs (Phase 3)
User-controlled free text (`injury_notes`, session `notes`) flows into the Claude prompt. A user cannot harm other users with this (single prompt, their own data), but they can try to jailbreak the generator into returning unsafe sessions. The deterministic gate and the backend clamp are the real protection, which is good design, but add two things: (a) treat `injury_notes` as data, not instructions, by placing it inside a clearly delimited block in the prompt with an instruction that text inside is athlete-reported information only; (b) keep the post-generation schema+safety validation as the authority, never trusting the model's output shape. The spec already does (b); make (a) explicit.

### 8. AI output validation needs a hard schema, not just "parse JSON" (Phase 3)
"Strict JSON only" is necessary but not sufficient. Action: validate the parsed object against a Zod schema before it touches the database, reject-and-fallback on any mismatch, and cap `structure_json` total duration and block count to sane bounds so a malformed-but-valid-JSON response cannot create a 9-hour session. This is part of the existing clamp step; make the Zod contract explicit in the truth-conditions.

### 9. Cost and abuse controls on the AI endpoint (Phase 3)
`/sessions/generate` calls a paid API. With multi-user on, this is a money-spending endpoint exposed to any logged-in user. Action: add a per-user rate limit (for example, a small number of generations per day), since legitimate use is roughly one per session. This protects the bill and is a natural truth-condition.

### 10. Login brute-force and account protections (Phase 0)
The spec hashes passwords with bcrypt (correct) and uses httpOnly signed cookies (correct), but says nothing about login throttling. Action: add per-IP and per-account rate limiting on `/auth/login`, a generic "invalid credentials" message (no user enumeration), and a minimum password policy enforced at signup. Set the session cookie `Secure`, `HttpOnly`, `SameSite=Lax`. Add CSRF protection for the cookie-authenticated state-changing routes (SameSite=Lax covers most, but the OAuth callback and any cross-site POST need an explicit CSRF token or origin check).

### 11. Strava OAuth `state` parameter and CSRF on the callback (Phase 5)
The spec mentions a state param in passing. Make it a hard requirement: generate a cryptographically random `state`, store it server-side bound to the user's session, and reject the callback if it does not match. Without this the OAuth flow is open to CSRF account-linking. The callback route is exempt from the normal auth middleware, which makes the state check the only thing standing in for auth on that route, so it is not optional.

---

## Dependency & third-party register (was scattered; here in one place)

### Runtime npm dependencies
- `next` (14+), `react`, `react-dom`: framework and UI.
- `typescript`, `@types/*`: types.
- `tailwindcss`, `postcss`, `autoprefixer`: styling.
- `drizzle-orm`, `drizzle-kit`: ORM and migrations.
- `@neondatabase/serverless`: Postgres driver (replaces `@vercel/postgres`).
- `@anthropic-ai/sdk`: Claude API client.
- `@tanstack/react-query`: data fetching/caching on the client.
- `recharts`: progress charts.
- `iron-session` (or `jose` if rolling cookies directly): signed session cookies.
- `bcrypt` (or `bcryptjs` if native build is a problem on Vercel): password hashing.
- `zod`: input validation and AI-output schema validation.
- A small rate-limit helper (for example `@upstash/ratelimit` with Upstash Redis, or a simple Postgres-backed counter) for login and AI-generate throttling. If avoiding another external service, implement a Postgres-based limiter.
- No Strava client library required: direct `fetch`. (If preferred, `strava-v3` exists, but direct fetch keeps the dependency surface small and is the spec's stated choice.)
- No XML library required for `.zwo`: template strings with proper escaping. If escaping correctness is a worry, use a tiny builder, but hand-rolled with an `escapeXml` helper is fine and tested.

### Dev dependencies
- `vitest`, `@vitest/coverage-v8`: tests and coverage.
- `@testing-library/react`, `@testing-library/jest-dom`: component tests for the on-bike UI and onboarding.
- `msw` (Mock Service Worker) or simple fetch mocks: to mock Anthropic and Strava in integration tests.
- `eslint`, `prettier`: lint/format.

### Third-party APIs and external services
- **Anthropic Messages API** (`api.anthropic.com`): session generation. Auth via `ANTHROPIC_API_KEY`. Model `claude-sonnet-4-6`. Cost: per-token, roughly cents per generation at this size; gate with the per-user limit in finding 9. Server-side only.
- **Strava API** (`www.strava.com/api/v3`, OAuth at `www.strava.com/oauth`): activity pull. Per-user OAuth2 auth-code + refresh. Scope `activity:read_all`, read-only. Constraints: single-player then 10-athlete cap then review; 100/15min + 1000/day read limits; mandatory brand button and Developer Program form; agreement last updated 1 June 2026 (re-read at build). `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, callback domain set to the Vercel deployment domain.
- **Neon Postgres** (via Vercel Marketplace native integration): data store. Injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`. Free tier is sufficient for single user; scales to zero (cold starts). Deleting the integration in Vercel permanently deletes the Neon project and data, so the README backup note matters.
- **Vercel** (hosting/build/serverless): the deploy target. Free/hobby tier covers single user. Set all env vars in the Vercel project settings.
- **Zwift** (no API): consumes the exported `.zwo` files via the desktop workout folder; uploads completed rides to Strava. No credentials, no integration code; the dependency is the file format and the user's manual drop-in step.
- **(Optional, if chosen for rate limiting)** Upstash Redis: serverless Redis for the limiter. Adds `UPSTASH_REDIS_REST_URL` and token. Skip if using the Postgres-based limiter.

### Full environment variable list (supersedes the scattered mentions)
Required (app crashes if missing): `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (migrations), `SESSION_SECRET`, `TOKEN_ENC_KEY`, `ANTHROPIC_API_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SIGNUP_ENABLED`, `APP_BASE_URL` (for the Strava callback and absolute links).
Optional: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (only if using Upstash for limits).
Note: the previous `POSTGRES_URL` name is replaced by `DATABASE_URL`. The README's "APP password hashing" refers to generating the seeded owner's bcrypt hash for the seed script, not an env var.

---

## Security findings (consolidated)

Beyond the must/should items above, confirmed-good and additional points:

Good as specified: passwords bcrypt-hashed; httpOnly signed cookies; secrets server-side; per-user query scoping as the load-bearing invariant; 404 (not 403) on cross-user IDs to avoid leaking existence; read-only Strava scope.

Add or make explicit:
- **Cookie flags:** `Secure`, `HttpOnly`, `SameSite=Lax`, sensible expiry, rotate the session secret capability.
- **CSRF:** origin/CSRF protection on cookie-authenticated state-changing POSTs, mandatory state check on the Strava callback (finding 11).
- **Rate limiting:** login (finding 10) and AI-generate (finding 9).
- **Token encryption at rest:** Strava tokens (finding 6).
- **Input validation:** Zod on every request body and on AI output (finding 8); treat free-text as data in prompts (finding 7).
- **No secrets to client:** verify at review that no env var without a `NEXT_PUBLIC_` prefix is ever referenced in client components, and that nothing puts the Anthropic key or Strava secret into a client bundle. Add this as a Phase 0 truth-condition.
- **Security headers:** set a baseline via Next config (Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, etc.). A strict CSP also blunts any XSS that could read the in-memory session state.
- **Dependency hygiene:** pin versions, run `npm audit` in CI, keep the dependency surface small (the spec already favours this).
- **Logging:** never log tokens, passwords, or full request bodies containing them; the request-id in the envelope is fine.

---

## Mobile-responsive design (currently under-specified; this section is the requirement)

The spec says "mobile-first" and "large touch targets, high contrast, minimal scrolling" for the Today view, which is the right instinct but is not enough to build against consistently. The following are the concrete, testable mobile requirements to add. They matter because the primary on-bike device is a phone, used at arm's length, mid-effort, often sweaty, sometimes one-handed.

### Breakpoints and layout
- Mobile-first Tailwind: design at the smallest width first, layer up with `sm` / `md` / `lg`. Target a 360px-wide baseline (small Android) up through tablet and desktop dashboard.
- Single-column on mobile throughout. The desktop dashboard (Progress especially) may use a multi-column grid at `lg`+, but every screen must be fully usable in one narrow column.
- The Today session view must fit the prescribed block and its watt target without horizontal scrolling and with minimal vertical scrolling at 360px.

### On-bike "ride mode" specifics (Today screen)
- Current/next block watt target rendered as a very large numeral (think glanceable from a metre away), with the block phase and remaining-in-block context secondary.
- Minimum 48x48px touch targets for every interactive control; primary actions (start, "I rode it", generate next) are large, thumb-reachable near the bottom of the viewport.
- High-contrast palette that survives a bright room and a sweaty glance; do not rely on subtle colour differences to convey zone.
- No hover-dependent interactions anywhere (touch devices have no hover); all information must be reachable by tap.
- Avoid tiny tables during a ride; the block list is large rows, not a dense grid.
- Consider `prefers-reduced-motion`; do not animate the live target.

### Forms (readiness, post-ride log, onboarding)
- Readiness and post-ride inputs are tap-targets (segmented 0-3 / 1-10 selectors), not free-typing on a phone mid-session. Big buttons, not sliders that are fiddly with sweaty thumbs.
- Use correct input modes: `inputmode="decimal"` for weight, `inputmode="numeric"` for integer fields, so the right keyboard appears.
- Inputs at least 16px font size to prevent iOS auto-zoom on focus.
- Onboarding wizard: one logical step per screen on mobile, a visible progress indicator, back/next as large buttons, no step that requires horizontal scrolling.

### Viewport, PWA-readiness, and platform quirks
- Correct `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Respect safe-area insets (notches, home indicator) with `env(safe-area-inset-*)` so bottom actions are not under the home bar.
- Sizing in `dvh`/`svh` rather than `vh` where full-height is needed, to handle mobile browser chrome show/hide without layout jump.
- Add a web app manifest and apple-touch-icon so the user can add Pace to the home screen and launch it full-screen for on-bike use. (Not a native app; just installable-PWA basics. This is a small, high-value add given the use case and is worth an explicit truth-condition.)
- Test on real mobile Safari and Chrome, not just a desktop responsive emulator; the keyboard, safe-area, and dvh behaviours differ.

### Charts (Progress)
- Recharts must use its responsive container and remain readable on a narrow screen: limit series, allow horizontal legends to wrap, ensure axis labels do not overlap at 360px. On mobile, prefer fewer, taller stacked charts over wide multi-series ones.

### Truth-conditions to add (Phase 6, plus one in Phase 0)
- Phase 0: a build-time or test check that no server-only secret is referenced in any client bundle.
- Phase 6: at a 360px viewport, the Today session view shows the watt target with no horizontal scroll and primary actions within thumb reach; every interactive control is at least 48x48px; all readiness/log inputs are operable by tap without a hardware keyboard.
- Phase 6: the app is installable to the home screen and launches full-screen with safe-area insets respected.

---

## Summary of changes to make before building

1. Rename Vercel Postgres to Neon; switch driver to `@neondatabase/serverless`; env `DATABASE_URL`(+ unpooled). (Must, pre-Phase 0)
2. Note Neon cold start + pooled-connection handling. (Must, pre-Phase 0)
3. Document Strava single-player/10-athlete/review ceiling. (Must, A6 + Phase 7)
4. Add Strava brand button + Developer Program form requirement. (Must, Phase 5 + README)
5. Bound the Strava fetch, handle 429, plan webhooks as the upgrade. (Should, Phase 5)
6. Encrypt Strava tokens at rest with `TOKEN_ENC_KEY`. (Should, Phase 5)
7. Treat user free-text as data in the AI prompt. (Should, Phase 3)
8. Zod-validate AI output and bound session size. (Should, Phase 3)
9. Per-user rate limit on AI generate. (Should, Phase 3)
10. Login throttling, cookie flags, password policy, CSRF. (Should, Phase 0)
11. Mandatory OAuth state check on the Strava callback. (Should, Phase 5)
12. Add the consolidated env var list and dependency register. (Must, README + Phase 0)
13. Add the concrete mobile-responsive requirements and their truth-conditions. (Should, Phase 6 + Phase 0)

Keep everything else as written. The bones are good; these are the things that make it safe, current, and genuinely pleasant to use on a bike.
