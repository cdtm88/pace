# Requirements: Pace

**Defined:** 2026-06-14
**Core Value:** The full loop must work end-to-end: AI generates a session from your profile, you ride it, and it's logged against the plan.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can create an account with email and password
- [x] **AUTH-02**: User can log in and remain logged in across browser sessions (httpOnly signed cookie)
- [x] **AUTH-03**: User can log out from any page
- [x] **AUTH-04**: Login endpoint is rate-limited per-IP and per-account; invalid credentials return a generic error message (no user enumeration)
- [x] **AUTH-05**: SIGNUP_ENABLED flag gates public registration; the owner account is accessible without the flag

### Profile & Onboarding

- [x] **PROF-01**: New user is guided through an onboarding wizard capturing training goals, injury notes, and optionally FTP and weight; FTP is not required — complete beginners and injury-recovery users can skip it and still receive generated sessions
- [ ] **PROF-02**: User can edit their profile (FTP, weight, goals, injury notes) at any time after onboarding; FTP can be added later once a test is possible
- [x] **PROF-03**: When FTP is present, it is used as the reference for all watt targets and zone labels; when absent, Claude generates sessions using RPE-based descriptions and conservative absolute-watt targets appropriate for the user's stated context (beginner / returning from injury)

### Session Generation

- [ ] **GEN-01**: User can generate a structured interval session by entering a readiness score (0–3 tap-selector) which, combined with their profile, is sent to Claude
- [ ] **GEN-02**: AI output is validated against a Zod schema before database write; sessions with malformed structure, missing fields, or out-of-bounds power targets are rejected with a user-visible fallback
- [ ] **GEN-03**: AI generation endpoint is rate-limited per user per day to prevent runaway cost

### Today View (On-Bike Display)

- [ ] **TODAY-01**: User can view today's generated session with the current block's watt target rendered as a glanceable large numeral, with block type, duration, and sequence context secondary
- [ ] **TODAY-02**: When FTP is set, each session block displays the power zone label (Z1–Z7 / Active Recovery / Endurance / Tempo / Threshold / VO2 Max / Anaerobic / Neuromuscular) alongside the watt target; when FTP is absent, RPE descriptors (Easy, Moderate, Hard, Very Hard) are shown instead
- [ ] **TODAY-03**: User can export the current session as a Zwift-compatible `.zwo` file; when FTP is set, power values are written as FTP fractions (e.g. 0.75); when FTP is absent, absolute watt targets from the AI are written as fractions of a conservative reference value; user-supplied text fields are XML-escaped

### Strava Integration

- [ ] **STRAVA-01**: User can connect their Strava account via OAuth2 using the official "Connect with Strava" button asset
- [ ] **STRAVA-02**: User can disconnect their Strava account; tokens are deleted from the database on disconnect
- [ ] **STRAVA-03**: After connecting (or on manual refresh), the last 30 Strava activities are fetched and auto-matched to logged sessions by date/duration proximity
- [ ] **STRAVA-04**: Strava access tokens are refreshed before expiry; HTTP 429 responses from Strava are handled with exponential backoff and a user-visible "couldn't reach Strava — tap to retry" state
- [ ] **STRAVA-05**: Strava tokens (`access_token`, `refresh_token`) are encrypted at rest using AES-GCM with a `TOKEN_ENC_KEY` environment variable; plaintext tokens are never written to the database

### Progress

- [ ] **PROG-01**: When FTP is set, each generated session displays its estimated TSS before the ride; when FTP is absent, estimated duration and approximate intensity (Easy / Moderate / Hard) are shown instead
- [ ] **PROG-02**: User can view a weekly TSS bar chart (recharts) showing training load over rolling weeks

### Mobile / PWA

- [ ] **PWA-01**: App is installable to the device home screen and launches full-screen (web app manifest + apple-touch-icon + Serwist service worker)
- [ ] **PWA-02**: Today view respects device safe-area insets (`env(safe-area-inset-*)`) and uses `dvh`/`svh` sizing to prevent layout shift when mobile browser chrome shows/hides
- [ ] **PWA-03**: All interactive controls in the Today view are at minimum 48×48px; primary actions (generate, mark complete) are within thumb reach at the bottom of the viewport
- [ ] **PWA-04**: No hover-dependent interactions anywhere; all information is reachable by tap
- [ ] **PWA-05**: Input fields use correct `inputmode` attributes (`numeric`, `decimal`); font size ≥16px on all inputs to prevent iOS auto-zoom

## v2 Requirements

### Authentication

- **AUTH-V2-01**: User can reset password via email link (requires Resend/Postmark integration)

### Profile

- **PROF-V2-01**: User can log HRV or wearable readiness score (Oura, WHOOP) instead of manual 0–3 tap input

### Session Generation

- **GEN-V2-01**: User can view and regenerate a session before committing
- **GEN-V2-02**: User can provide post-ride feedback notes that feed future session context

### Progress

- **PROG-V2-01**: Session history list with completed/skipped status
- **PROG-V2-02**: CTL/ATL/TSB training form chart (requires weeks of data to be meaningful)

### Strava

- **STRAVA-V2-01**: Strava webhook subscription (push on new activity) replaces polling; eliminates read traffic and removes 429 exposure

### Multi-User

- **MULTI-V2-01**: SIGNUP_ENABLED flag flipped; public registration open after Strava Developer Program approval
- **MULTI-V2-02**: Admin view for user management

## Out of Scope

| Feature | Reason |
|---------|--------|
| Password reset via email | Adds email service dependency (Resend/Postmark); not needed for single-owner v1 |
| Coggan zone calculation UI | Zone labels in Today view are sufficient; full zone table adds complexity without ride-time value |
| Post-ride tap-input log form | Strava auto-match is the logging mechanism; a separate manual log is redundant in v1 |
| Session history list | TSS chart provides the progress view; a full list is v2 |
| Training calendar / plan management | A separate product; session-at-a-time is the right v1 scope |
| HRV / wearable sync | High integration cost; subjective 0–3 readiness is strongly correlated with HRV |
| CTL/ATL/TSB form chart | Requires weeks of data; weekly TSS bar chart is the right v1 scope |
| Strava webhooks | Polling 30 activities is sufficient in v1; webhooks are the post-v1 upgrade |
| Garmin / Wahoo / .fit export | Zwift .zwo only in v1 |
| Native mobile app | PWA is sufficient; App Store review is unnecessary friction |
| Coach-athlete relationships | Single user type in v1; no role hierarchy |
| Zwift API integration | File drop-in is the interface; no Zwift account auth required |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| PROF-01 | Phase 2 | Complete |
| PROF-02 | Phase 2 | Pending |
| PROF-03 | Phase 2 | Complete |
| GEN-01 | Phase 3 | Pending |
| GEN-02 | Phase 3 | Pending |
| GEN-03 | Phase 3 | Pending |
| TODAY-01 | Phase 4 | Pending |
| TODAY-02 | Phase 4 | Pending |
| TODAY-03 | Phase 4 | Pending |
| PROG-01 | Phase 4 | Pending |
| STRAVA-01 | Phase 5 | Pending |
| STRAVA-02 | Phase 5 | Pending |
| STRAVA-03 | Phase 5 | Pending |
| STRAVA-04 | Phase 5 | Pending |
| STRAVA-05 | Phase 5 | Pending |
| PROG-02 | Phase 5 | Pending |
| PWA-01 | Phase 6 | Pending |
| PWA-02 | Phase 6 | Pending |
| PWA-03 | Phase 6 | Pending |
| PWA-04 | Phase 6 | Pending |
| PWA-05 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-06-14*
*Last updated: 2026-06-14 after roadmap creation*
