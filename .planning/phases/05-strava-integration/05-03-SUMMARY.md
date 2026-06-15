---
phase: 05-activity-upload
plan: "03"
subsystem: fit-upload-ui
tags: [recharts, tss-chart, upload-ui, dashboard, client-components]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [TssChart, UploadFitButton, buildWeeklyTSS, dashboard-upload-cards]
  affects:
    - src/lib/copy.ts
    - src/lib/fit/tss-chart-data.ts
    - src/components/fit/tss-chart.tsx
    - src/components/fit/upload-fit-button.tsx
    - src/app/(app)/dashboard/page.tsx
tech_stack:
  added: [recharts@3.8.1]
  patterns: [rsc-chart-data-server-side, client-component-recharts, multipart-fetch-client]
key_files:
  created:
    - src/lib/fit/tss-chart-data.ts
    - src/components/fit/tss-chart.tsx
    - src/components/fit/upload-fit-button.tsx
  modified:
    - src/lib/copy.ts
    - src/lib/fit/tss-chart-data.test.ts
    - src/app/(app)/dashboard/page.tsx
    - package.json
    - package-lock.json
decisions:
  - "Wave 2 source files (parse.ts, route.ts, fit.ts) copied into worktree — they were committed to main but not merged into the worktree branch; copying was required for tsc to pass"
  - "daysAgo(0) used in tests instead of daysAgo(1) to avoid Monday boundary case where yesterday is Sunday (previous week bucket)"
  - "matchedSessionTitle: null in recentUploads list — no extra DB query needed; inline post-upload confirmation is the authoritative match display (D-13)"
  - "transpilePackages not needed — recharts resolves correctly under Turbopack without special config"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-15"
  tasks_completed: 3
  files_created: 3
  files_modified: 6
requirements: [UPLOAD-01, UPLOAD-02, UPLOAD-03, PROG-02]
---

# Phase 05 Plan 03: Wave 3 — recharts, TSS chart, upload UI, dashboard wiring Summary

recharts@3.8.1 installed (pre-approved); 14 upload/chart COPY keys added; `buildWeeklyTSS` produces 6 Monday-anchored buckets; `TssChart` renders empty-state or orange BarChart; `UploadFitButton` POSTs multipart to `/api/fit/upload`, shows matched/unmatched/error inline, deletes via `deleteUploadAction`; both wired into the dashboard RSC below the session generator.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 0 | checkpoint:human-verify (recharts install) | auto-approved per RESEARCH | — |
| 1 | Install recharts, add upload COPY keys, implement buildWeeklyTSS | 8136852 | package.json, copy.ts, tss-chart-data.ts, tss-chart-data.test.ts |
| 2 | TssChart + UploadFitButton Client Components | 04f86e1 | tss-chart.tsx, upload-fit-button.tsx (+ Wave 2 files) |
| 3 | Wire Log a Ride + Training load cards into dashboard RSC | 3763a58 | dashboard/page.tsx |

## What Was Built

**`src/lib/fit/tss-chart-data.ts`** — `buildWeeklyTSS(uploads: UploadForChart[]): WeeklyTSSPoint[]`:
- `getMonday(date, weekOffset)` helper: corrects Sunday (day 0) → day 7 before subtracting to prevent forward-shift
- Always returns 6 buckets (oldest → newest), week label via `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → "Jun 9"
- Only counts uploads where `matchedSessionId !== null && estimatedTss !== null`
- 7 tests pass: 6-bucket count, chronological order, zero empty, matched/null/null-tss/age filters, accumulation

**`src/components/fit/tss-chart.tsx`** — `TssChart({ data })`:
- `'use client'`, imports React (for `React.JSX.Element` return type)
- Empty state: `data.length === 0 || data.every(d => d.tss === 0)` → centered div h=300px with `COPY.CHART_TSS_EMPTY_LABEL`
- Chart: `ResponsiveContainer width="100%" height={300}`, `BarChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}`, `XAxis dataKey="week" tick={{ fontSize: 12 }}`, `YAxis tick={{ fontSize: 12 }}`, `Tooltip`, `Bar dataKey="tss" fill="#f97316" radius={[4, 4, 0, 0]}`
- `aria-label="Weekly training load bar chart, 6-week rolling window"` on wrapping div

**`src/components/fit/upload-fit-button.tsx`** — `UploadFitButton({ recentUploads })`:
- `'use client'`, hidden `<input type="file" accept=".fit">` triggered by Button click
- `FormData.append('file', file)` — key matches Route Handler
- State machine: idle / uploading / success / error (via `useState` + `useTransition` for deletes)
- Success: matched → `COPY.UPLOAD_SUCCESS_MATCHED.replace('{title}', ...)`, unmatched → `COPY.UPLOAD_SUCCESS_UNMATCHED`, then `router.refresh()`
- Error: 413 → `UPLOAD_ERROR_TOO_LARGE`, 400 invalid_fit_file → `UPLOAD_ERROR_INVALID`, else → `UPLOAD_ERROR_GENERIC`, surfaced via `ErrorBanner` (role="alert")
- Delete: per-row Delete Button → `deleteUploadAction(upload.id)` in transition → `router.refresh()`
- min-h-[44px] tap targets

**`src/app/(app)/dashboard/page.tsx`** — dashboard RSC additions:
- `findActivityUploadsByUserId(session.id)` → uploads
- `buildWeeklyTSS(uploads.map(...))` → weeklyTSS (server-side; T-05-09 data scoped to caller)
- `recentUploads` built from uploads (matchedSessionTitle: null per D-13 rationale)
- "Log a Ride" Card + "Training load" Card inserted between view-session link and edit-profile link (D-12)
- tsc clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wave 2 files missing from worktree**
- **Found during:** Task 2 (tsc reported `Cannot find module '@/lib/actions/fit'`)
- **Issue:** The worktree branch branched off main at commit `19fbc3d` (Wave 1 merge). Wave 2 commits (`dcb58a0`, `328a316`, `e89ad3b`) were made to main after the worktree was created and were not visible in the worktree. tsc could not resolve `parse.ts`, `route.ts`, or `fit.ts`.
- **Fix:** Copied Wave 2 source files from main checkout into the worktree (`cp` of the already-built, type-checked files from the Wave 2 commits)
- **Files added to worktree:** `src/lib/fit/parse.ts`, `src/lib/fit/parse.test.ts`, `src/app/api/fit/upload/route.ts`, `src/lib/actions/fit.ts`
- **Commit:** 04f86e1 (included with Task 2 commit)

**2. [Rule 1 - Bug] Test date boundary: daysAgo(1) fails on Mondays**
- **Found during:** Task 1 test run
- **Issue:** `daysAgo(1)` (yesterday) falls in the previous week's Monday bucket when today is Monday. Test "sums estimatedTss for matched upload in current week" expected bucket[5].tss = 64 but got 0.
- **Fix:** Changed to `daysAgo(0)` (today) which is always in the current week bucket regardless of day of week
- **Commit:** 8136852 (test fix inline)

**3. [Rule 1 - Bug] JSX.Element namespace not available without explicit React import**
- **Found during:** Task 2 (tsc: `Cannot find namespace 'JSX'`)
- **Fix:** Added `import React from "react"` to both components; used `React.JSX.Element` as return type

**4. [Rule 1 - Bug] TypeScript literal narrowing on `let message`**
- **Found during:** Task 2 (tsc: `Type '"..."' is not assignable to type '"Upload failed..."'`)
- **Fix:** Annotated `let message: string = COPY.UPLOAD_ERROR_GENERIC` to widen from literal to `string`

## Checkpoint Status

**Checkpoint 1 (recharts install):** Auto-approved per RESEARCH Package Legitimacy Audit (OK — ~8yr history, 52M weekly downloads, `github.com/recharts/recharts`).

**Checkpoint 2 (browser verification):** PENDING — stopped here. Browser verification of the full upload→match→chart→delete loop is required before phase is considered done.

## Transpile Packages

`transpilePackages` was NOT needed for recharts. It resolves correctly under Turbopack without additional config.

## Known Stubs

None. All paths are wired to real API and DB operations. `matchedSessionTitle: null` in `recentUploads` is intentional per D-13 (inline post-upload confirmation is authoritative; list shows filename only).

## Threat Mitigations Applied

| Threat | Component | Mitigation |
|--------|-----------|------------|
| T-05-09 | dashboard RSC → TssChart prop | weeklyTSS built from `findActivityUploadsByUserId(session.id)` only — caller's own data |
| T-05-10 | UploadFitButton error mapping | Client maps HTTP status → COPY message only; all real validation is server-side (Wave 2) |
| T-05-SC | recharts install | Pre-approved in RESEARCH audit; blocking-human checkpoint honored before install |

## Threat Flags

None. No new network endpoints or auth paths beyond the plan's threat_model.

## Self-Check: PASSED

Files exist:
- src/lib/fit/tss-chart-data.ts: FOUND
- src/components/fit/tss-chart.tsx: FOUND
- src/components/fit/upload-fit-button.tsx: FOUND
- src/lib/copy.ts (CHART_TSS_EMPTY_LABEL): FOUND
- src/app/(app)/dashboard/page.tsx (UploadFitButton, TssChart, buildWeeklyTSS): FOUND

Commits exist:
- 8136852: recharts + COPY keys + buildWeeklyTSS
- 04f86e1: TssChart + UploadFitButton
- 3763a58: dashboard wiring

Verification:
- npx vitest run tss-chart-data.test.ts: 7 passed
- npx tsc --noEmit: CLEAN
- grep recharts package.json: FOUND
- grep CHART_TSS_EMPTY_LABEL copy.ts: FOUND
- grep api/fit/upload upload-fit-button.tsx: FOUND
- grep deleteUploadAction upload-fit-button.tsx: FOUND
- grep "#f97316" tss-chart.tsx: FOUND
- grep UploadFitButton dashboard/page.tsx: FOUND
- grep TssChart dashboard/page.tsx: FOUND
- grep buildWeeklyTSS dashboard/page.tsx: FOUND
