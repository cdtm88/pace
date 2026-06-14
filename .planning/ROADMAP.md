# Roadmap: Pace

## Overview

Six phases deliver the full generate → ride → log loop. Foundation and auth come first because every subsequent layer reads from the session. Profile unlocks AI generation, which in turn enables the Today view and .zwo export (the path from session to bike). Strava integration closes the loop and feeds the progress chart. PWA polish lands last, once the screens it will cache are stable.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - DB schema, auth (signup/login/logout), SIGNUP_ENABLED flag, multi-user scoping, security baseline
- [ ] **Phase 2: Profile & Onboarding** - Onboarding wizard, profile editing, FTP-optional data model, Coggan zone utility
- [ ] **Phase 3: AI Session Generation** - Claude integration, Zod output schema, deterministic safety gate, per-user rate limit
- [ ] **Phase 4: Today View & Export** - On-bike glanceable display, .zwo export, pre-ride TSS/intensity preview
- [ ] **Phase 5: Strava Integration** - OAuth connect/disconnect, AES-GCM token encryption, activity auto-match, 429 handling, progress chart
- [ ] **Phase 6: PWA & Polish** - Serwist service worker, manifest, safe-area insets, touch targets, input attributes

## Phase Details

### Phase 1: Foundation

**Goal**: The app is deployed, users can create accounts and log in, and every database table enforces per-user data isolation from day one
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):

  1. Owner can create an account with email and password; SIGNUP_ENABLED=false blocks all other registrations
  2. Logged-in user stays logged in across browser sessions via httpOnly signed iron-session cookie
  3. User can log out from any page and is immediately redirected to the login screen
  4. Login endpoint returns a generic error for invalid credentials and rate-limits repeated attempts per-IP and per-account
  5. Every DB table carries a user_id foreign key and index; a query scoped to user A cannot return data belonging to user B**Plans**: 3 plans

**Wave 1**

  - [ ] 01-01-PLAN.md — Scaffold Next.js 16 + Drizzle schema (4 tables, user_id FK) + migration + test scaffolding

**Wave 2** *(blocked on Wave 1 completion)*

  - [ ] 01-02-PLAN.md — Auth route handlers (signup/login/logout) + dual-axis rate limiting

**Wave 3** *(blocked on Wave 2 completion)*

  - [ ] 01-03-PLAN.md — proxy.ts route protection + IDOR-safe queries + login/signup UI

### Phase 2: Profile & Onboarding

**Goal**: A logged-in user can complete onboarding and maintain a profile that the AI generation layer will read
**Depends on**: Phase 1
**Requirements**: PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):

  1. New user is guided through an onboarding wizard and lands on the dashboard with a complete profile saved (goals, injury notes; FTP and weight optional)
  2. User can edit any profile field at any time, including adding FTP later after completing a test
  3. When FTP is present, the app resolves Coggan power zones (Z1–Z7) from it; when absent, the app uses RPE descriptors without error or degraded UI

**Plans**: TBD
**UI hint**: yes

### Phase 3: AI Session Generation

**Goal**: A user with a profile can generate a structured interval session that is safe, schema-validated, and persisted
**Depends on**: Phase 2
**Requirements**: GEN-01, GEN-02, GEN-03
**Success Criteria** (what must be TRUE):

  1. User selects a readiness score (0–3 tap-selector) and receives a generated session; the AI prompt uses the user's profile (FTP, goals, injury notes) as context
  2. A session with malformed structure, missing fields, or a powerFraction outside [0.1, 1.8] is rejected before database write; user sees a visible fallback message
  3. A deterministic safety gate (outside AI) validates session safety before persist; sessions that pass the gate are written to the DB
  4. A user who has hit their daily generation limit receives a clear "limit reached" message instead of an AI call

**Plans**: TBD

### Phase 4: Today View & Export

**Goal**: A user can see today's generated session in a glanceable on-bike format and export it as a Zwift-compatible .zwo file
**Depends on**: Phase 3
**Requirements**: TODAY-01, TODAY-02, TODAY-03, PROG-01
**Success Criteria** (what must be TRUE):

  1. Today view shows the current block's watt target as a large numeral with block type, duration, and sequence context visible at arm's length
  2. When FTP is set, each block shows a power zone label (Z1–Z7); when FTP is absent, RPE descriptors (Easy / Moderate / Hard / Very Hard) are shown
  3. User can export the session as a .zwo file; power values are written as FTP fractions (e.g. 0.75) and all user-supplied text is XML-escaped
  4. Before the ride, user sees either estimated TSS (when FTP is set) or estimated duration and approximate intensity (Easy / Moderate / Hard) when FTP is absent

**Plans**: TBD
**UI hint**: yes

### Phase 5: Strava Integration

**Goal**: User can connect Strava and have completed rides automatically matched to their generated sessions; progress chart shows training load
**Depends on**: Phase 4
**Requirements**: STRAVA-01, STRAVA-02, STRAVA-03, STRAVA-04, STRAVA-05, PROG-02
**Success Criteria** (what must be TRUE):

  1. User connects Strava via the official "Connect with Strava" button; OAuth callback verifies the cryptographic state parameter and confirms activity:read scope before storing tokens
  2. Strava access and refresh tokens are stored encrypted (AES-GCM) and are never written to the database in plaintext
  3. After connecting (or on manual refresh), the last 30 Strava activities are fetched and auto-matched to logged sessions by date/duration proximity
  4. When the Strava API returns HTTP 429, the app retries with exponential backoff and shows a "couldn't reach Strava — tap to retry" state to the user
  5. User can disconnect Strava; tokens are deleted from the database on disconnect
  6. User can view a weekly TSS bar chart (recharts, 6-week rolling window) showing training load over time

**Plans**: TBD
**UI hint**: yes

### Phase 6: PWA & Polish

**Goal**: The app is installable to the home screen, renders correctly on mobile without layout shift, and all interactions work by tap
**Depends on**: Phase 5
**Requirements**: PWA-01, PWA-02, PWA-03, PWA-04, PWA-05
**Success Criteria** (what must be TRUE):

  1. App can be added to the iOS and Android home screen via web app manifest + apple-touch-icon + Serwist service worker; it launches full-screen
  2. Today view uses dvh/svh sizing and env(safe-area-inset-*) so no content is clipped by device notches or browser chrome showing/hiding
  3. All interactive controls in Today view are at minimum 48×48px; primary actions are reachable within thumb range at the bottom of the viewport
  4. No information or action anywhere in the app is accessible only via hover; every feature is reachable by tap
  5. All input fields use correct inputmode attributes and have font-size ≥16px; iOS Safari does not auto-zoom on focus

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Not started | - |
| 2. Profile & Onboarding | 0/TBD | Not started | - |
| 3. AI Session Generation | 0/TBD | Not started | - |
| 4. Today View & Export | 0/TBD | Not started | - |
| 5. Strava Integration | 0/TBD | Not started | - |
| 6. PWA & Polish | 0/TBD | Not started | - |
