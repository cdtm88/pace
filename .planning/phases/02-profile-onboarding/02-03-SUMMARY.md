---
phase: 02-profile-onboarding
plan: "03"
subsystem: profile-onboarding
tags: [profile-form, rsc, dashboard, ftp-status, useActionState, useFormStatus]
dependency_graph:
  requires: ["02-01", "02-02"]
  provides: ["ProfileForm", "/profile route", "dashboard FTP status"]
  affects: ["src/app/(app)/dashboard/page.tsx"]
tech_stack:
  added: []
  patterns:
    - useActionState(saveProfileAction) + SubmitButton child using useFormStatus
    - RSC pre-population: findUserProfileByUserId → defaultValue on form fields
    - DASHBOARD_FTP_ACTIVE.replace("{value}", String(profile.ftp)) — never expose raw token
key_files:
  created:
    - src/components/profile/profile-form.tsx
    - src/app/(app)/profile/page.tsx
  modified:
    - src/app/(app)/dashboard/page.tsx
    - src/app/api/auth/signup/route.ts
decisions:
  - useActionState reuses existing saveProfileAction from Plan 02 — no new mutation logic
  - ProfileForm uses defaultValue (not controlled state) for pre-population — simpler for RSC-fed data
  - Dashboard FTP value substituted server-side via string replace to avoid raw token reaching HTML
  - signup route NeonDbError unique-violation check must walk err.cause chain (Drizzle wraps raw error)
requirements-completed: [PROF-02, PROF-03]
metrics:
  duration: "~45 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 4
---

# Phase 02 Plan 03: ProfileForm + Dashboard FTP Status Summary

**Pre-populated profile edit form + /profile RSC page + dashboard FTP/RPE status wired; full onboarding → edit-FTP → dashboard loop browser-verified and approved**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ProfileForm component + /profile RSC page | aac7ba1 | src/components/profile/profile-form.tsx, src/app/(app)/profile/page.tsx |
| 2 | Dashboard FTP status + edit-profile link | 59dbaed | src/app/(app)/dashboard/page.tsx |
| 3 | Browser verification — full onboarding → edit → dashboard loop | APPROVED | human-verified |

## Key Decisions

1. **`useActionState` reuses Plan 02 `saveProfileAction`** — no new Server Action needed. The existing action handles both onboarding (first save) and profile edit (upsert update). Commit: aac7ba1.

2. **`defaultValue` for pre-population (not controlled state)** — RSC passes existing profile data as a plain prop; `defaultValue` on native inputs gives the browser control after initial render, which is the correct pattern for progressive-enhancement forms using `useActionState`.

3. **FTP value substituted via `.replace("{value}", String(profile.ftp))`** — the raw `{value}` token from `COPY.DASHBOARD_FTP_ACTIVE` is never written to HTML. Substitution happens server-side in the RSC before rendering.

4. **signup route NeonDbError cause-chain walk** — Drizzle wraps the raw NeonDbError inside `err.cause`; the unique-violation check must inspect `(err?.cause as any)?.code === "23505"` rather than the top-level error property.

## Browser Verification (Task 3) — Approved

User confirmed all loop steps:
- Login → /dashboard → redirect to /onboarding (no redirect loops)
- Goals validation: blank goals shows inline error; filled goals advances to Step 2
- Step 2 (Injuries) optional skip works; Step 3 FTP/Weight optional
- Submit without FTP lands on dashboard showing "No FTP set · Using RPE mode" + "Edit profile" link
- /profile loads with Goals pre-populated; adding FTP 250 and saving redirects to dashboard showing "FTP: 250W · Coggan zones active"
- Reload persists FTP status; DB has exactly one user_profiles row (upsert confirmed — PROF-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NeonDbError cause-chain walk in signup route**
- **Found during:** Browser verification (Task 3) — duplicate email test revealed 500 response instead of expected "Email already registered" error
- **Issue:** Drizzle ORM wraps the raw NeonDbError inside `err.cause`; the top-level error code was undefined, so the unique-violation branch was never entered
- **Fix:** Changed check in `src/app/api/auth/signup/route.ts` to inspect `(err?.cause as any)?.code === "23505"`
- **Files modified:** src/app/api/auth/signup/route.ts
- **Verification:** Signup with duplicate email returns correct 409 response
- **Committed in:** Separate fix commit during browser verification

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix corrects silent error-swallowing on duplicate signup — correctness requirement. No scope creep.

## Threat Surface Scan

No new network endpoints or auth paths introduced. `/profile` page gates on `session.id` (redirect to `/login` if absent) and the `(app)` layout additionally enforces `onboardingComplete`. `saveProfileAction` re-reads `userId` from session on every submit (defense in depth, T-02-01). No new trust boundaries beyond what the plan's threat model documented.

## Self-Check

- [x] `src/components/profile/profile-form.tsx` starts with `"use client"`, uses `useActionState` from `react` and `useFormStatus` from `react-dom` in separate `SubmitButton` child
- [x] Fields carry `name="goals"`, `name="injuries"`, `name="ftp"`, `name="weight"` with `defaultValue` from `existing`
- [x] `src/app/(app)/profile/page.tsx` calls `findUserProfileByUserId(session.id)` and renders `<ProfileForm existing={...} />`
- [x] `src/app/(app)/dashboard/page.tsx` calls `findUserProfileByUserId(session.id)`
- [x] `replace("{value}"` grep returns 2 in dashboard/page.tsx (variable assignment + usage counted)
- [x] `href="/profile"` link present using `COPY.DASHBOARD_LINK_EDIT_PROFILE`
- [x] `npx tsc --noEmit` — no errors in `src/`
- [x] `npx vitest run` — 59/59 tests pass
- [x] `npx next build` — green; `/dashboard` and `/profile` listed as dynamic routes

- [x] Task 3 browser verification checkpoint — user approved full loop
- [x] PROF-02: profile upsert confirmed (single row, no duplicate)
- [x] PROF-03 display half: FTP-absent (RPE mode) and FTP-present (Coggan zones) both verified

## Self-Check: PASSED — PLAN COMPLETE
