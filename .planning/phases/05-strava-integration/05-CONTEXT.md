# Phase 5: Strava Integration - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Strava OAuth connect/disconnect, AES-GCM token encryption at rest, activity auto-matching to training sessions, 429 backoff handling, and a weekly TSS bar chart on the dashboard. The phase closes the generate → ride → log loop.

**In scope:** Strava OAuth flow (connect/disconnect), `stravaConnections` table migration (add token columns), AES-GCM encryption utility, activity fetch + auto-match (on connect + manual refresh), 429 retry with exponential backoff, dashboard Strava section (connect/disconnect UI), recharts TSS bar chart (6-week rolling), `strava_activity_id` column on `training_sessions`.

**Out of scope:** Strava webhooks (v2), Garmin/Wahoo export, coach-athlete features, session history list, PWA polish (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### OAuth Flow & Callback Architecture

- **D-01: State parameter storage:** Store the CSRF state in iron-session under a `pending_strava_state` key. Reuses existing iron-session infrastructure — no extra dependency. Set on redirect to Strava, delete immediately after callback validation (prevent replay).
- **D-02: Scope mismatch handling:** If the callback does not include `activity:read` in the granted scope, redirect to `/dashboard?strava_error=scope_denied` and display in the existing `ErrorBanner` component.
- **D-03: Button placement:** "Connect with Strava" official button lives on the dashboard page, below the session generator in its own card/section. Shows either the connect button (disconnected state) or "Connected as {athleteName}" + disconnect button (connected state).

### Token Storage & Encryption

- **D-04: Schema columns to add to stravaConnections:** `stravaAthleteId` (bigint), `accessToken` (text, AES-encrypted), `refreshToken` (text, AES-encrypted), `expiresAt` (integer, Unix epoch seconds), `scope` (text), `athleteName` (text, for dashboard display).
- **D-05: Encryption approach:** `TOKEN_ENC_KEY` as a 32-byte base64 string (already in `src/env.ts`). Use Web Crypto API (`crypto.subtle`) directly — no external packages. AES-GCM, 128-bit IV.
- **D-06: IV storage:** Prefix IV to ciphertext in the same column — `base64(iv + ciphertext)`. Single column per field, simple decode: first 16 bytes = IV, remainder = ciphertext.
- **D-07: Token refresh timing:** Proactive — check `expiresAt - 600` (10-minute buffer) before any Strava API call. If within window, refresh first (atomically update DB), then proceed. On 401 from Strava, treat as "disconnected — prompt reconnect" (per STATE.md Pitfall note).

### Activity Matching Algorithm

- **D-08: Match criteria:** Same calendar date (UTC date string match) AND duration within ±20% of `training_sessions.totalDurationSec`. Fetches up to the last 30 Strava activities (bounded page — per CONSTRAINTS).
- **D-09: Match storage:** Add `stravaActivityId` (bigint, nullable) column to `training_sessions` table via a new migration. Null = unmatched, non-null = matched to that Strava activity ID.
- **D-10: Match trigger:** On initial Strava connect (after token storage) + manual "Refresh" button on dashboard. NOT on every page load — respects the 100 req/15min rate limit.
- **D-11: UI for unmatched sessions:** None. Sessions display as-is; the Strava badge only appears when a match exists. No "No Strava match" indicator — keeps the UI clean for new users.

### Dashboard UI & TSS Chart

- **D-12: Strava section on dashboard:** Separate card section below the session generator, above the edit-profile link and logout. Connected state: "Connected as {athleteName}" + "Refresh" button + "Disconnect" link. Disconnected state: official "Connect with Strava" button SVG asset (required by Strava brand guidelines).
- **D-13: TSS chart:** Recharts `BarChart` with `ResponsiveContainer` (~300px height). 6-week rolling window — one bar per week, height = sum of TSS for matched sessions in that week. Placed below the Strava section on the dashboard.
- **D-14: 429 / API error handling:** On `HTTP 429` from Strava, implement exponential backoff (3 retries: 1s, 2s, 4s). If still failing, show `ErrorBanner` with "Couldn't reach Strava — tap to retry" and a retry button that re-invokes the refresh Server Action.
- **D-15: Empty chart state:** Show the chart frame with a text label "Complete sessions and connect Strava to see training load" when no weekly TSS data exists. Avoids hiding and showing the chart as data accumulates.

### Claude's Discretion

- Exact Tailwind classes for the Strava connection card and TSS chart container
- COPY key names in `src/lib/copy.ts` for new user-visible strings (connect success, disconnect confirmation, chart empty state)
- Exact bar color for the TSS chart (suggest orange/red, cycling brand conventions)
- Whether to compute weekly TSS in a DB query (aggregate) or in-memory (6 weeks × ≤7 sessions is tiny — in-memory is fine)
- Whether the "Refresh" button triggers a Server Action or a Route Handler POST

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/session.ts` — `sessionOptions`, `SessionData` type; use for `getIronSession()` in all Strava route handlers
- `src/lib/db/queries.ts` — `findStravaConnection()`, `findTrainingSession()`, `listTrainingSessions()` already scaffolded; extend with new helpers
- `src/lib/db/schema.ts` — `stravaConnections` table skeleton exists (id, userId unique FK, createdAt); needs token columns via migration
- `src/components/ui/error-banner.tsx` — existing error display component; use for 429 state
- `src/components/ui/button.tsx` — existing Button; use for disconnect, refresh actions
- `src/components/ui/card.tsx` — existing Card; use for Strava section container
- `src/lib/copy.ts` — COPY pattern for all user-visible strings
- `src/lib/training/tss.ts` — `estimateTSS()` already implemented; feeds the chart data

### Established Patterns
- IDOR guard: `and(eq(table.userId, userId), eq(table.id, id))` — mandatory for resource fetches
- iron-session in Route Handlers: `getIronSession<SessionData>(await cookies(), sessionOptions)` — `cookies()` is async (Next.js 16)
- Server Actions for mutations; Route Handlers for OAuth callback and GET endpoints
- COPY pattern: all user-visible strings in `src/lib/copy.ts`
- Error display via `ErrorBanner` component

### Integration Points
- `src/app/(app)/dashboard/page.tsx` — add Strava section (D-12) and TSS chart (D-13)
- `src/lib/db/schema.ts` — extend `stravaConnections` columns; add `stravaActivityId` to `trainingSessions`
- `src/lib/db/queries.ts` — add strava helpers: `findStravaConnectionByUserId`, `upsertStravaConnection`, `deleteStravaConnection`, `updateSessionStravaMatch`
- `src/env.ts` — `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `APP_BASE_URL` already exported
- New files needed:
  - `src/lib/strava/crypto.ts` — AES-GCM encrypt/decrypt via Web Crypto API
  - `src/lib/strava/client.ts` — Strava API fetch helpers (activities, token refresh)
  - `src/lib/strava/match.ts` — activity matching algorithm
  - `src/app/api/strava/callback/route.ts` — OAuth callback handler
  - `src/lib/actions/strava.ts` — Server Actions: connect (initiate OAuth redirect), disconnect, refresh

</code_context>

<specifics>
## Specific Ideas

- Official "Connect with Strava" button: use the SVG from `https://developers.strava.com/guidelines/` (download locally to `public/` — do not hotlink)
- OAuth state param: `crypto.randomUUID()` stored as `session.pending_strava_state` before redirect to Strava
- Strava OAuth callback URL: `${APP_BASE_URL}/api/strava/callback`
- Token exchange endpoint: `POST https://www.strava.com/oauth/token`
- Activities endpoint: `GET https://www.strava.com/api/v3/athlete/activities?per_page=30`
- TSS chart bar color: suggest `#f97316` (orange-500 in Tailwind) — cycling brand association
- `athleteName` display: `athlete.firstname + " " + athlete.lastname` from Strava token exchange response
- TSS chart X-axis: week labels like "Jun 9", "Jun 16", etc.

</specifics>

<deferred>
## Deferred Ideas

- Strava webhooks (real-time push on new activity) — v2 requirement, out of scope for v1
- `STRAVA-V2-01`: webhook subscription replaces polling (noted in REQUIREMENTS.md)
- Avatar/profile photo from Strava — `athlete.profile` URL available but adds complexity; skipped in v1

</deferred>

---

*Phase: 5-strava-integration*
*Context gathered: 2026-06-15*
