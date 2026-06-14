---
phase: 03-ai-session-generation
plan: "03"
subsystem: ai-session-generation
tags: [dashboard-ui, session-generator, readiness-selector, use-transition, client-component]
dependency_graph:
  requires:
    - 03-02 (generateSessionAction, GeneratedSession type, trainingSessions schema)
    - 02-03 (findUserProfileByUserId, profile shape)
    - 01-03 (Button, Card, ErrorBanner shadcn components)
  provides:
    - SessionGenerator (readiness tap-selector + generate + summary card + error display)
    - Dashboard wired to full GEN-01 generation loop
  affects:
    - 04-today-view (will replace compact summary card with full Today view)
tech_stack:
  added: []
  patterns:
    - "useTransition for imperative Server Action call (not useActionState — non-form pattern, RESEARCH Pattern 6)"
    - "Readiness tap-selector via variant toggling (default=selected, outline=unselected)"
    - "formatDuration helper: seconds → human-readable '45 min' or '1h 30m'"
    - "aria-pressed on tap-selector buttons for screen reader selection state"
    - "aria-busy on Generate button while isPending for accessibility"
key_files:
  created:
    - src/components/session/session-generator.tsx
  modified:
    - src/app/(app)/dashboard/page.tsx
decisions:
  - "useTransition not useActionState — generateSessionAction is an imperative call, not a form submission; Pattern 6 from RESEARCH.md explicitly covers this (no revalidatePath to avoid isPending hang)"
  - "rawJson excluded from SessionSummary display type — only title/totalDurationSec/blocks rendered; rawJson count in component = 0 (T-03-07)"
  - "profile prop typed inline matching userProfiles.$inferSelect shape — avoids importing the full Drizzle infer type into a client component boundary"
metrics:
  duration: "8 minutes"
  completed: "2026-06-14T18:35:00Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 3 Plan 3: Dashboard Generation UI Summary

One-liner: SessionGenerator client component wired to dashboard — readiness tap-selector (0–3) gates the Generate button, useTransition calls generateSessionAction with spinner, success renders compact title/duration/block-count card, errors surface via ErrorBanner without leaking technical detail.

## What Was Built

### Task 1: SessionGenerator client component

**File:** `src/components/session/session-generator.tsx`

`"use client"` component exporting `SessionGenerator`. Implements the full GEN-01 UI surface:

**Tap-selector (D-11):** Four buttons in a 2-column (mobile) / 4-column (sm+) grid rendered from `READINESS_OPTIONS`. Selected score uses `variant="default"` (primary fill); unselected uses `variant="outline"`. Each button has `aria-pressed` for accessibility. Buttons use `h-12` class (48px touch target, future-proofed for Phase 6). Clicking a new score clears any previous generation result.

**State:** `readiness: number | null`, `result: ActionResult | null`, `isPending` from `useTransition`. No `useActionState` — this is a non-form imperative call per RESEARCH Pattern 6.

**Generate button (D-12):** `disabled={isPending || readiness === null}`, `aria-busy={isPending}`. Handler runs `startTransition(async () => { const res = await generateSessionAction(readiness); setResult(res) })`.  While pending: `Loader2` spin icon + "Generating..." label. Otherwise: "Generate Session".

**Success card (D-12):** Renders when `result?.data` is truthy. Shows `sessionData.title`, formatted duration via `formatDuration(totalDurationSec)` (`"45 min"` or `"1h 30m"` format), and block count from `sessionData.blocks.length`. No redirect — stays on dashboard. No `rawJson` or technical content rendered (grep count = 0).

**ErrorBanner (D-13):** Renders when `result?.error` is set. Covers all three action error paths: GEN-02 fallback ("Couldn't generate a valid session..."), GEN-03 limit ("Daily limit reached..."), and API error ("Generation failed..."). No internal error detail exposed.

### Task 2: Dashboard wired to SessionGenerator

**File:** `src/app/(app)/dashboard/page.tsx`

Added single import line and single render line. `<SessionGenerator profile={profile} />` placed directly below the FTP status line paragraph and above the edit-profile link. The existing `findUserProfileByUserId(session.id)` fetch is reused — no second DB round-trip. All existing markup preserved unchanged (heading, FTP status, edit-profile link, signed-in-as text, logout form).

### Task 3: Checkpoint (auto-approved in auto-mode)

Browser verification of the end-to-end GEN-01 loop. Checkpoint auto-approved per `--auto` flag. Manual browser verification is the next step after phase merge.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The SessionGenerator is fully wired:
- Tap-selector: complete with 4 options, highlight state, aria-pressed
- Generate button: complete with disabled gate, spinner, aria-busy
- Success card: complete with title, duration, block count
- ErrorBanner: complete for all three error message paths

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. T-03-07 (technical detail leakage) is fully mitigated:
- `rawJson` count in session-generator.tsx = 0
- `SessionSummary` type exposes only `title`, `totalDurationSec`, `blocks` to the render layer
- `result.error` renders the action's generic user-facing string only (never Zod issues or safety reasons)
- `ANTHROPIC_API_KEY` not imported — component only imports the `'use server'` action

## Self-Check: PASSED

Files on disk:
- src/components/session/session-generator.tsx — FOUND
- src/app/(app)/dashboard/page.tsx — FOUND (modified)

Commits:
- 62ebfe1 — Task 1 (SessionGenerator component)
- 71a6327 — Task 2 (dashboard wiring)

Test suite: 84 tests passing, 0 failures (npx vitest run).
