---
phase: 04-today-view-export
verified: 2026-06-15T13:03:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Generate session → redirect → /session/[id] pre-ride screen appears"
    expected: "After tapping Generate, browser navigates to /session/[id]. Title, badge row (~N TSS · duration or Intensity · duration), and scrollable block list are visible."
    why_human: "redirect() behavior under useTransition in a real browser cannot be asserted in unit tests. Executor completed UAT (04-02 Task 4 item 1) but verifier did not run a live browser session."
  - test: "Tap-to-advance riding view — watt numeral, zone/RPE, block counter, complete state"
    expected: "Tapping the full-screen watt area advances to the next block. Counter updates (e.g. '2 / 6'). After the last block, 'Session complete' card appears with 'Back to dashboard' button navigating to /dashboard."
    why_human: "useState machine transitions (pre-ride → riding → complete) require browser render and interaction. No React Testing Library tests exist for session-detail.tsx."
  - test: "Export .zwo download in Chrome"
    expected: "Clicking 'Export .zwo' triggers a browser file download named {sanitized-title}.zwo containing valid Zwift XML."
    why_human: "window.open() download behavior is browser-specific. The original <a> approach required 6 iterative fix commits before settling on window.open() — confirming the browser behavior is the sensitive part."
  - test: "Dashboard 'View session' link conditional render"
    expected: "No 'View session' link for a new user with no sessions. Link appears after first session is generated and navigates correctly to /session/[id]."
    why_human: "{latestSession && (...)} conditional requires live DB state in both null and non-null branches to confirm both render paths."
---

# Phase 4: Today View & Export — Verification Report

**Phase Goal:** The generate→ride→log loop is functional end-to-end for the session owner. A user can: (1) generate a session → get redirected to /session/[id]; (2) see a pre-ride summary with title, TSS/intensity badge, and scrollable block list; (3) download a Zwift-compatible .zwo file; (4) tap through an on-bike riding view (full-screen watt display, tap-to-advance); (5) reach a "Session complete" state with a back-to-dashboard link.
**Verified:** 2026-06-15T13:03:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (previous VERIFICATION.md was self-authored by executor, not a verifier)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | generateSessionAction redirects to /session/{id} on success | VERIFIED | `redirect(\`/session/${inserted.id}\`)` at line 189 of session.ts, outside all try/catch blocks (Pitfall 3 compliant). Test `calls validateSessionSafety + DB insert and redirects to /session/{id} on success` passes with mock asserting the correct path. |
| 2 | /session/[id] RSC page gates auth and IDOR, then renders pre-ride summary | VERIFIED | page.tsx: `const { id } = await params` (Next.js 16 async params), `getIronSession` → `redirect("/login")` if unauthenticated, `findTrainingSession(ironSession.id, id)` with `and()` in queries.ts → `notFound()` on null, `computeTSS`/`computeIntensityLabel` computed server-side, all 5 props passed to `<SessionDetail>`. |
| 3 | Pre-ride summary shows title, badge row, scrollable block list, and action row | VERIFIED | session-detail.tsx `subState === "pre-ride"` branch: `session.title` in h1, badge string from `tss !== null` conditional (COPY.SESSION_BADGE_TSS / SESSION_BADGE_INTENSITY with real values substituted), `blocks.map(block => <SessionBlockRow key={block.order} block={block} ftp={ftp}>)`, sticky action row with `window.open()` export button and Start session Button. SessionBlockRow calls `getZoneForWatts` and renders zone pill or `block.rpe`. |
| 4 | .zwo XML builder produces Zwift-compatible XML; export route serves it as a file download with correct headers | VERIFIED | zwo.ts: `buildZwoXml` emits `<?xml version="1.0" encoding="UTF-8"?>` + `<workout_file>` with author, name, description, sportType, workout elements. Block mapping: warmup→Warmup (PowerLow+PowerHigh), cooldown→Cooldown (PowerLow+PowerHigh), work/rest→SteadyState (Power). `xmlEscape` applied & first. `toFixed(3)` on powerFraction. export/route.ts: GET, async params, iron-session auth (401 before DB), `findTrainingSession` IDOR guard (404), `Content-Type: application/xml`, `Content-Disposition: attachment; filename="${safeName}.zwo"`. 37 tests green. |
| 5 | Riding view shows full-screen watt display with tap-to-advance; session complete state provides back-to-dashboard | VERIFIED | session-detail.tsx `subState === "riding"`: `text-[120px] font-black tabular-nums` watt numeral, `getZoneForWatts` → zone string or `block.rpe`, block counter via `SESSION_BLOCK_COUNTER`, full-screen `div onClick={advance}`. `advance()` increments blockIndex or flips to `"complete"`. Complete branch: `SESSION_COMPLETE_HEADING` CardTitle, `SESSION_COMPLETE_BACK` Button with `window.location.href = "/dashboard"`. |

**Score:** 5/5 truths VERIFIED

---

### Deferred Items

None. All roadmap deliverables for Phase 4 are implemented.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/training/tss.ts` | computeTSS, computeIntensityLabel | VERIFIED | Substantive. Imported and called in page.tsx lines 20, 54-55. |
| `src/lib/training/format.ts` | formatDuration | VERIFIED | Substantive. Imported and used in session-detail.tsx (lines 19, 66, 71, 152) and session-block-row.tsx (lines 14, 32). |
| `src/lib/training/zwo.ts` | buildZwoXml, xmlEscape, sanitizeFilename | VERIFIED | Substantive. Imported and called in export/route.ts lines 21, 50-51. 37 tests. |
| `src/lib/copy.ts` | 9 SESSION_* keys | VERIFIED | All 9 keys present (lines 102-110). SESSION_PRE_RIDE_EXPORT_BTN, SESSION_PRE_RIDE_START_BTN, SESSION_COMPLETE_HEADING, SESSION_COMPLETE_BACK, SESSION_BADGE_TSS, SESSION_BADGE_INTENSITY, SESSION_DASHBOARD_VIEW_LINK, SESSION_BLOCK_COUNTER, SESSION_EXPORT_ERROR. |
| `src/lib/actions/session.ts` | redirect after insert | VERIFIED | `redirect()` at line 189, after DB try/catch closes at line 178. |
| `src/app/(app)/session/[id]/page.tsx` | RSC page, auth, IDOR, server TSS | VERIFIED | 66 lines. All security contracts present. |
| `src/components/session/session-detail.tsx` | 3-state machine, window.open export | VERIFIED | "use client", 3 sub-states, 180 lines of substantive UI logic. |
| `src/components/session/session-block-row.tsx` | Block row with zone/RPE | VERIFIED | "use client", getZoneForWatts called, FTP/no-FTP conditional. |
| `src/app/api/session/[id]/export/route.ts` | GET handler, auth, IDOR, file response | VERIFIED | 67 lines. All security contracts present. |
| `src/app/(app)/dashboard/page.tsx` | View session conditional link | VERIFIED | findLatestSessionByUserId at line 43, conditional render at lines 70-77. |
| `tests/tss.test.ts` | 22 unit tests | VERIFIED | 22 tests pass. Covers null FTP, empty blocks, TSS math, all intensity threshold boundaries. |
| `tests/zwo-export.test.ts` | 37 unit tests | VERIFIED | 37 tests pass. Covers xmlEscape (all 5 chars, ampersand-first), block mapping, powerFraction precision, null notes, XML escaping, sanitizeFilename. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generateSessionAction` | `/session/{id}` | `redirect()` line 189 | WIRED | Outside try/catch — NEXT_REDIRECT not catchable |
| `session/[id]/page.tsx` | `computeTSS` / `computeIntensityLabel` | import line 20, calls lines 54-55 | WIRED | Props passed to SessionDetail |
| `session/[id]/page.tsx` | `findTrainingSession` | import line 17, call line 42 | WIRED | IDOR guard in queries.ts uses `and()` |
| `session-detail.tsx` | `/api/session/[id]/export` | `window.open(url)` onClick line 98 | WIRED | Bypasses Next.js router click interceptor |
| `session-detail.tsx` | `getZoneForWatts` | import line 18, call line 121 (riding view) | WIRED | Zone label in riding display |
| `session-detail.tsx` | `SessionBlockRow` | import line 17, render in blocks.map line 87 | WIRED | Block list in pre-ride view |
| `session-block-row.tsx` | `getZoneForWatts` | import line 13, call line 27 | WIRED | Zone pill vs RPE conditional |
| `export/route.ts` | `buildZwoXml` / `sanitizeFilename` | import line 21, calls lines 50-51 | WIRED | XML generation and filename |
| `export/route.ts` | `findTrainingSession` | import line 20, call line 42 | WIRED | IDOR-safe fetch before XML build |
| `dashboard/page.tsx` | `findLatestSessionByUserId` | import line 23, call line 43 | WIRED | Feeds "View session" conditional link |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `session-detail.tsx` | `tss`, `intensity` props | `computeTSS`/`computeIntensityLabel` called in page.tsx with blocks from `findTrainingSession` DB query | Yes — Drizzle query with IDOR guard | FLOWING |
| `session-detail.tsx` | `blocks` prop | `findTrainingSession(ironSession.id, id)` → `db.select().from(trainingSessions).where(and(...))` | Yes | FLOWING |
| `session-block-row.tsx` | `block` prop | Passed from `blocks.map()` in session-detail.tsx | Yes — same DB source | FLOWING |
| `export/route.ts` | `session` (for XML) | `findTrainingSession(ironSession.id, id)` — real DB row | Yes | FLOWING |
| `dashboard/page.tsx` | `latestSession` | `findLatestSessionByUserId` — `db.select().from(trainingSessions).orderBy(desc(...)).limit(1)` | Yes | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 22 TSS tests pass | `npx vitest run tests/tss.test.ts` | 22 passed, 0 failed, 130ms | PASS |
| 37 ZWO export tests pass | `npx vitest run tests/zwo-export.test.ts` | 37 passed, 0 failed, 152ms | PASS |
| Full suite — no regressions | `npx vitest run` | 146 passed (12 files), 0 failed, 697ms | PASS |
| redirect() outside try/catch | Source read session.ts | Line 189 after catch closes line 178 and null guard line 183 | PASS |
| IDOR `and()` pattern | Source read queries.ts | `and(eq(trainingSessions.userId, userId), eq(trainingSessions.id, id))` confirmed | PASS |
| Export headers | Source read route.ts | `Content-Type: application/xml`, `Content-Disposition: attachment; filename="${safeName}.zwo"` | PASS |
| SESSION_* COPY keys (9) | Source read copy.ts | All 9 keys present lines 102-110 | PASS |

---

## Probe Execution

Step 7c: SKIPPED — no probe scripts found in `scripts/*/tests/probe-*.sh`.

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| TODAY-01 | Pre-ride summary screen (title, badge, block list, actions) | SATISFIED | session-detail.tsx pre-ride branch; session/[id]/page.tsx passes server-computed props |
| TODAY-02 | Tap-to-advance riding view (watt, zone/RPE, block counter, complete state) | SATISFIED | session-detail.tsx riding + complete branches; advance() function wires state machine |
| TODAY-03 | .zwo export download | SATISFIED | zwo.ts + export/route.ts; 37 unit tests; correct headers |
| PROG-01 | RPE fallback when FTP absent | SATISFIED | `computeIntensityLabel` returns label when ftp is null; `getZoneForWatts` returns null → `block.rpe` rendered in SessionBlockRow and riding view |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/copy.ts` | 86-91 | `FIELD_PLACEHOLDER_*` strings match "placeholder" grep | INFO | Input field hint strings (e.g., `"e.g. 250"`), not stub code. No impact. |
| `src/lib/training/tss.ts` | 28, 31, 51, 54 | `return null` | INFO | Intentional null returns for no-FTP / empty-blocks paths per D-10. Feed the PROG-01 RPE fallback. Not stubs. |

No unreferenced TBD/FIXME/XXX markers. No placeholder UI. No empty handlers. No hardcoded empty arrays/objects feeding rendered output.

---

## Human Verification Required

### 1. Generate Session → Redirect → Pre-Ride Screen

**Test:** Log in, complete the session generator, tap "Generate". Observe browser navigation.
**Expected:** Browser navigates to `/session/[id]`. Pre-ride screen displays session title, a badge row (`~{N} TSS · {duration}` if FTP set, or `{Easy|Moderate|Hard} · {duration}` if not), and a scrollable block list with zone pills or RPE text.
**Why human:** `redirect()` under `useTransition` in a real browser cannot be asserted in unit tests. Executor confirmed in UAT (04-02-SUMMARY Task 4 item 1), but this verification did not run a live browser session.

### 2. Tap-to-Advance Riding View and Session Complete State

**Test:** On the pre-ride screen, tap "Start session". Tap the watt display area to advance through all blocks.
**Expected:** Each tap advances to the next block. Counter updates (e.g., "2 / 6"). After the final block, tapping transitions to the "Session complete" card. Tapping "Back to dashboard" navigates to `/dashboard`.
**Why human:** `useState` machine transitions (`pre-ride → riding → complete`) require browser render and interaction. No React Testing Library tests exist for session-detail.tsx.

### 3. .zwo Download in Chrome

**Test:** On the pre-ride screen, tap "Export .zwo".
**Expected:** Browser downloads a file named `{sanitized-title}.zwo`. File content starts with `<?xml version="1.0" encoding="UTF-8"?>` and contains valid Zwift workout structure.
**Why human:** `window.open()` download behavior is browser- and OS-specific. The original `<a>` approach required 6 iterative fix commits (`064559e` through `965d47f`) before settling on `window.open()` — the browser interaction is the sensitive path.

### 4. Dashboard "View Session" Link Conditional Render

**Test:** Log in as a new user with no sessions. Confirm no "View session" link appears. Generate a session. Return to dashboard. Confirm link appears and navigates to the session.
**Expected:** No link before any session exists; link present and correct after first session.
**Why human:** `{latestSession && (...)}` conditional requires live DB state in both the null and non-null branches.

---

## Gaps Summary

No gaps. All 5 observable truths are VERIFIED against source code. All 12 required artifacts exist, are substantive, and are wired. All data flows originate from real DB queries with IDOR guards. 59 unit tests (22 TSS + 37 ZWO) pass. Full suite 146/146 green. The 4 human verification items are browser-interaction checks that cannot be resolved by code inspection — nothing in the code indicates they would fail.

---

_Verified: 2026-06-15T13:03:00Z_
_Verifier: Claude (gsd-verifier)_
