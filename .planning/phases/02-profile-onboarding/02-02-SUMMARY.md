---
phase: 02-profile-onboarding
plan: "02"
subsystem: profile-onboarding
tags: [server-action, onboarding, wizard, form, auth-gate, copy]
dependency_graph:
  requires: ["02-01"]
  provides: ["saveProfileAction", "OnboardingWizard", "onboarding-gate"]
  affects: ["src/app/(app)/layout.tsx", "proxy.ts"]
tech_stack:
  added: []
  patterns:
    - useActionState(saveProfileAction, null) + hidden inputs for multi-step form
    - (app)/(onboarding) route group separation for redirect loop prevention
    - iron-session read in RSC + onConflictDoUpdate upsert in Server Action
key_files:
  created:
    - src/lib/actions/profile.ts
    - src/components/onboarding/onboarding-wizard.tsx
    - src/app/(onboarding)/onboarding/page.tsx
  modified:
    - src/lib/copy.ts
    - src/app/(app)/layout.tsx
    - proxy.ts
decisions:
  - useActionState for final step only; earlier steps use local state + type=button navigation
  - goals/injuries carried as hidden inputs on step 3 form to avoid separate state management complexity
  - /onboarding intentionally absent from PUBLIC_PATHS; session gate in page.tsx prevents loop
metrics:
  duration: "~25 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 6
---

# Phase 02 Plan 02: Onboarding Wizard Summary

**One-liner:** 3-step wizard (goals → injuries → FTP/weight) wired to `saveProfileAction` Server Action (iron-session auth → Zod parse → Drizzle upsert → revalidate → redirect); (app) layout gate redirects unboarded users to /onboarding without looping.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | shadcn Textarea + Progress install | b2da610 | src/components/ui/textarea.tsx, src/components/ui/progress.tsx |
| 2 | saveProfileAction + copy.ts strings | f04dc14 | src/lib/actions/profile.ts, src/lib/copy.ts |
| 3 | Onboarding wizard + page + (app) gate + proxy | 72ed35e | src/components/onboarding/onboarding-wizard.tsx, src/app/(onboarding)/onboarding/page.tsx, src/app/(app)/layout.tsx, proxy.ts |

## Key Decisions

1. **Multi-step form state via `useState` + hidden inputs** — goals and injuries are stored in React state through steps 1–2, then carried as hidden `<input>` elements inside the step-3 `<form>` so the Server Action FormData receives all four fields on submit.

2. **`useActionState` on final step only** — the form wrapping only exists on step 3; earlier steps use `type="button"` navigation buttons to avoid accidental submission.

3. **Route group separation for loop prevention** — `(onboarding)/onboarding/page.tsx` checks `session.id` only (no `onboardingComplete`). The `onboardingComplete` gate lives exclusively in `(app)/layout.tsx`. This is the canonical Pitfall 1 fix: the two route groups are siblings, so the (app) layout never wraps the onboarding page.

4. **`/onboarding` NOT in PUBLIC_PATHS** — a logged-out user hitting `/onboarding` is correctly sent to `/login` by the session gate in both proxy.ts and the onboarding page itself. The proxy.ts comment explains this design decision inline.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries beyond what the plan's threat model documented. `saveProfileAction` is the only mutation surface; it is secured by the session gate at line 31 before any DB write.

## Self-Check

- [ ] `src/lib/actions/profile.ts` exists
- [ ] `src/lib/copy.ts` updated with Phase 2 keys
- [ ] `src/components/onboarding/onboarding-wizard.tsx` exists
- [ ] `src/app/(onboarding)/onboarding/page.tsx` exists
- [ ] `src/app/(app)/layout.tsx` has onboarding gate
- [ ] proxy.ts has /onboarding comment

## Self-Check: PASSED

All 7 files verified on disk. All 3 task commits verified in git log.
