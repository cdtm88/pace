---
phase: 04-today-view-export
plan: "02"
subsystem: session-ui
tags: [session, today-view, idor, client-state-machine, dashboard, dead-code-removal]
dependency_graph:
  requires:
    - computeTSS, computeIntensityLabel (src/lib/training/tss.ts — Plan 01)
    - formatDuration (src/lib/training/format.ts — Plan 01)
    - Phase 4 COPY constants SESSION_* (src/lib/copy.ts — Plan 01)
    - findTrainingSession, findLatestSessionByUserId (src/lib/db/queries.ts)
    - getZoneForWatts (src/lib/training/zones.ts)
    - GeneratedSession type (src/lib/db/schemas/session.ts)
  provides:
    - SessionPage — RSC at /session/[id] with auth gate + IDOR guard + server-side TSS
    - SessionDetail — three-state client machine (pre-ride / riding / complete)
    - SessionBlockRow — pre-ride block row with zone pill or RPE text
    - Dashboard "View session" conditional re-entry link
  affects:
    - src/app/(app)/dashboard/page.tsx (findLatestSessionByUserId added; View session link)
    - src/components/session/session-generator.tsx (dead success-card removed; ActionResult narrowed)
tech_stack:
  added: []
  patterns:
    - Next.js 16 async params — await params in RSC and Route Handler
    - IDOR guard: findTrainingSession(userId, id) with and(); notFound() on null (404 not 403)
    - jsonb cast: Array.isArray guard before casting session.blocks to GeneratedSession["blocks"]
    - Client sub-state machine via useState<SubState>("pre-ride")
    - Full-screen tap-to-advance riding view (onClick advance on container, no dedicated Next button)
    - Conditional null guard for latestSession before rendering View session link (Pitfall 5)
key_files:
  created:
    - src/app/(app)/session/[id]/page.tsx
    - src/components/session/session-detail.tsx
    - src/components/session/session-block-row.tsx
  modified:
    - src/app/(app)/dashboard/page.tsx
    - src/components/session/session-generator.tsx
decisions:
  - "Button component does not support asChild — complete view uses onClick to window.location.href instead of Button+Link wrapper"
  - "Dead success-card removal also required narrowing ActionResult type from data/error union to error-only shape and changing setResult(null) to setResult(undefined)"
  - "ESLint not in project dependencies; lint gate satisfied by tsc --noEmit (clean) + vitest (146 tests green)"
metrics:
  duration: "~4 minutes (Tasks 1-3; Task 4 is human-verify checkpoint)"
  completed: "2026-06-15"
  tasks_completed: 4
  files_changed: 7
---

# Phase 04 Plan 02: Session Detail UI — Sub-State Machine & Dashboard Link Summary

RSC session page at /session/[id] with auth gate and IDOR guard, a three-state client machine (pre-ride summary, full-screen tap-to-advance riding view, session complete), a SessionBlockRow component with zone/RPE display, and a conditional dashboard "View session" re-entry link — completing the glanceable display half of Phase 4.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Session RSC page — auth, IDOR, server-side TSS/intensity | 9aac56a | src/app/(app)/session/[id]/page.tsx |
| 2 | SessionDetail sub-state machine + SessionBlockRow | 7b1b32d | src/components/session/session-detail.tsx, src/components/session/session-block-row.tsx |
| 3 | Dashboard View session link + dead-code removal | d54eb1c | src/app/(app)/dashboard/page.tsx, src/components/session/session-generator.tsx |
| 4 | Human verification checkpoint + export fix | 965d47f | src/components/session/session-detail.tsx, src/app/api/session/[id]/export/route.ts |

## Verification Results

- `npx tsc --noEmit` — 0 src/ errors (pre-existing tests/auth.test.ts and tests/schema.test.ts errors are out of scope, confirmed in Plan 01/03 summaries)
- `npx vitest run` — 146 tests pass, no regressions
- Acceptance criteria verified for Tasks 1–3:
  - session/[id]/page.tsx: contains `const { id } = await params`, `findTrainingSession(ironSession.id, id)`, `notFound()`, `computeTSS(`, `computeIntensityLabel(`, renders `<SessionDetail` with all required props
  - session-detail.tsx: `"use client"`, `useState<SubState>("pre-ride")`, `"riding"` and `"complete"` transitions, `text-[120px]`, `tabular-nums`, `onClick={advance}`, `/api/session/${session.id}/export`, all COPY keys used
  - session-block-row.tsx: `getZoneForWatts(` called, `block.rpe` on null-zone branch
  - dashboard/page.tsx: `findLatestSessionByUserId`, `{latestSession && (`, `COPY.SESSION_DASHBOARD_VIEW_LINK`
  - session-generator.tsx: no CardTitle/success Card; `result?.error && <ErrorBanner` retained

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Button component does not support asChild prop**
- **Found during:** Task 2 (tsc check)
- **Issue:** The plan specified `<Button asChild><Link href="/dashboard">...</Link></Button>` for the complete view back button. The project's Button component (built on @base-ui/react/button) does not expose an `asChild` prop — TypeScript reported TS2322.
- **Fix:** Replaced with a plain `<Button onClick={() => { window.location.href = "/dashboard"; }}>` — same visual result, no asChild needed.
- **Files modified:** src/components/session/session-detail.tsx
- **Commit:** 7b1b32d (part of initial Task 2 commit)

**2. [Rule 1 - Bug] ActionResult type incompatible with null after narrowing**
- **Found during:** Task 3 (tsc check)
- **Issue:** After narrowing `ActionResult` to `{ error?: string } | undefined`, the existing `setResult(null)` call in the readiness tap-selector onClick became a type error (null not assignable to SetStateAction<ActionResult>).
- **Fix:** Changed `setResult(null)` to `setResult(undefined)` and initialized state with `useState<ActionResult>(undefined)` instead of `useState<ActionResult | null>(null)`.
- **Files modified:** src/components/session/session-generator.tsx
- **Commit:** d54eb1c

**3. [Rule 3 - Blocking] ESLint not available in project**
- **Found during:** Task 3 (lint check)
- **Issue:** `npx eslint` triggered download of eslint@10.5.0 which failed with "eslint.config.(js|mjs|cjs) not found" — the project has no ESLint config or dependency.
- **Fix:** Acceptance gate satisfied by `npx tsc --noEmit` (clean, 0 src/ errors) and `npx vitest run` (146 tests, all pass). ESLint absence is a pre-existing project state noted in CLAUDE.md (next lint removed in Next.js 16).
- **Files modified:** None

## Known Stubs

None. The session detail UI receives real data from the database via the RSC page. The complete view is intentionally minimal (Phase 5 will add Strava match status) but it is not a stub — it correctly transitions state and provides the "Back to dashboard" action.

## Threat Flags

All threats in the plan's threat model are addressed:

| Threat ID | Mitigation | Verified |
|-----------|------------|---------|
| T-04-07 | findTrainingSession(ironSession.id, id) — and() guard, notFound() on null (404) | page.tsx line 42–43 |
| T-04-08 | Only title/totalDurationSec/blocks/derived TSS passed as props; rawJson not forwarded | page.tsx line 57–62 |
| T-04-09 | Auth check (ironSession.id guard + redirect) runs before findTrainingSession call | page.tsx line 36–39 vs 42 |
| T-04-SC | No new packages introduced | confirmed |

## UAT Results (Task 4 — Human Verification)

All 5 UAT items passed:
1. Generate → redirect to /session/[id] ✓
2. Pre-ride summary: title, badge row (TSS · duration), block list ✓
3. Export .zwo: Chrome download works ✓ (fix: `window.open()` button bypasses Next.js anchor interceptor; `application/xml` Content-Type)
4. Riding view: 120px watt numeral, tap to advance, zone/RPE ✓
5. Complete state: "Session complete" heading, "Back to dashboard" ✓

Root cause of Chrome export failure: Next.js App Router's global click handler intercepted `<a>` clicks (including `target="_blank"`) before the browser could process them as downloads. `window.open()` called from a `<button>` onClick is not intercepted.

## Self-Check: PASSED

- src/app/(app)/session/[id]/page.tsx: FOUND
- src/components/session/session-detail.tsx: FOUND
- src/components/session/session-block-row.tsx: FOUND
- Commits 9aac56a, 7b1b32d, d54eb1c: all in git log
