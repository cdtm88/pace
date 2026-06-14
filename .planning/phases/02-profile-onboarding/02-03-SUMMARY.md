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
decisions:
  - useActionState reuses existing saveProfileAction from Plan 02 — no new mutation logic
  - ProfileForm uses defaultValue (not controlled state) for pre-population — simpler for RSC-fed data
  - Dashboard FTP value substituted server-side via string replace to avoid raw token reaching HTML
metrics:
  duration: "~2 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 3
---

# Phase 02 Plan 03: ProfileForm + Dashboard FTP Status Summary

**One-liner:** ProfileForm client component with `useActionState(saveProfileAction)` + SubmitButton using `useFormStatus`; `/profile` RSC pre-populates all four fields from DB; dashboard fetches profile and shows `DASHBOARD_FTP_ACTIVE` (value substituted) or `DASHBOARD_FTP_ABSENT` with an "Edit profile" link to `/profile`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ProfileForm component + /profile RSC page | aac7ba1 | src/components/profile/profile-form.tsx, src/app/(app)/profile/page.tsx |
| 2 | Dashboard FTP status + edit-profile link | 59dbaed | src/app/(app)/dashboard/page.tsx |

## Paused At

| Task | Name | Status |
|------|------|--------|
| 3 | Browser verification — full onboarding → edit → dashboard loop | awaiting human verify |

## Key Decisions

1. **`useActionState` reuses Plan 02 `saveProfileAction`** — no new Server Action needed. The existing action handles both onboarding (first save) and profile edit (upsert update). Commit: aac7ba1.

2. **`defaultValue` for pre-population (not controlled state)** — RSC passes existing profile data as a plain prop; `defaultValue` on native inputs gives the browser control after initial render, which is the correct pattern for progressive-enhancement forms using `useActionState`.

3. **FTP value substituted via `.replace("{value}", String(profile.ftp))`** — the raw `{value}` token from `COPY.DASHBOARD_FTP_ACTIVE` is never written to HTML. Substitution happens server-side in the RSC before rendering.

## Deviations from Plan

None — plan executed exactly as written.

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

## Self-Check: PASSED
