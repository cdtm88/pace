---
status: complete
phase: 02-profile-onboarding
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-06-15T00:00:00Z
updated: 2026-06-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Onboarding Redirect for New User
expected: After logging in as a user who has NOT completed onboarding, you're redirected to /onboarding — not /dashboard. No redirect loops occur.
result: pass

### 3. Onboarding Step 1 — Goals Required Validation
expected: On /onboarding step 1, submitting with a blank Goals field shows an inline error (goals is required). Filling in a goal allows advancing to Step 2.
result: pass

### 4. Onboarding Step 2 — Injuries Optional
expected: Step 2 shows an injuries textarea. Clicking Next without filling it in advances to Step 3 (the field is optional and does not block progress).
result: pass

### 5. Onboarding Step 3 — FTP/Weight Optional + Complete
expected: Step 3 shows FTP and Weight fields (both optional). Submitting without filling either field completes onboarding and redirects to /dashboard.
result: pass

### 6. Dashboard — No FTP Set (RPE Mode)
expected: When no FTP is set, the dashboard displays "No FTP set · Using RPE mode" with an "Edit profile" link below it.
result: pass

### 7. Dashboard — FTP Active (Coggan Zones)
expected: After setting FTP (e.g., 250) on /profile, the dashboard displays "FTP: 250W · Coggan zones active".
result: pass

### 8. Profile Form — Pre-populated Fields
expected: Visiting /profile shows a form pre-populated with the previously saved goals, injuries, FTP, and weight values.
result: pass

### 9. Profile Save — Updates Dashboard
expected: Editing FTP on /profile and saving redirects to /dashboard showing the updated FTP status.
result: pass

### 10. Boarded User Skips Onboarding
expected: A user who has already completed onboarding visiting /dashboard goes straight to the dashboard — NOT redirected to /onboarding again.
result: pass

### 11. Duplicate Email Signup Error
expected: Attempting to sign up with an email already in the database returns an "Email already registered." error message — not a 500 error.
result: issue
reported: "no i get redirected to the sign in page"
severity: major

### 12. Logged-out Access to /onboarding
expected: Visiting /onboarding without being logged in redirects to /login. No redirect loop occurs.
result: pass

## Summary

total: 12
passed: 11
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Attempting to sign up with an existing email shows 'Email already registered.' error inline on the signup page"
  status: failed
  reason: "User reported: no i get redirected to the sign in page"
  severity: major
  test: 11
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
