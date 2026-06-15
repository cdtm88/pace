---
phase: 04-today-view-export
plan: "03"
subsystem: zwo-export
tags: [zwo, xml, export, route-handler, tdd, idor, auth]
dependency_graph:
  requires:
    - src/lib/db/queries.ts (findTrainingSession — IDOR-safe fetch)
    - src/lib/session.ts (sessionOptions, SessionData)
    - src/lib/db/schemas/session.ts (GeneratedSession type for SessionBlock)
  provides:
    - buildZwoXml(session) — Zwift-compatible .zwo XML builder
    - xmlEscape(str) — XML 5-character escaper, ampersand-first order
    - sanitizeFilename(title) — filesystem-safe filename base (no extension)
    - GET /api/session/[id]/export — authenticated file download route
  affects:
    - Strava plan (Phase 5) — export is the download mechanism; Strava match will link back to this session
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN — failing tests committed before implementation
    - xmlEscape ampersand-first order (RESEARCH Pitfall 4)
    - toFixed(3) powerFraction precision (RESEARCH Pitfall 6)
    - IDOR guard: findTrainingSession(userId, id) with and() — 404 on no-match
    - Route Handler auth gate: 401 JSON before any DB access
    - async params in Next.js 16 Route Handlers (RESEARCH Pitfall 1)
key_files:
  created:
    - src/lib/training/zwo.ts
    - tests/zwo-export.test.ts
    - src/app/api/session/[id]/export/route.ts
  modified: []
decisions:
  - "xmlEscape applies & → &amp; first in chain; subsequent replacements cannot double-escape because & is already consumed"
  - "blockTypeToZwiftElement maps work AND rest to SteadyState per D-12; only warmup/cooldown use ramp element attributes"
  - "sanitizeFilename does not strip trailing hyphens — a title ending in '!' legitimately produces a trailing hyphen; the caller can strip if desired"
  - "Route Handler catch block logs to server console and returns 500 JSON with SESSION_EXPORT_ERROR copy"
  - "Pre-existing tsc errors in tests/auth.test.ts and tests/schema.test.ts are out-of-scope; src/ files type-check clean"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-15"
  tasks_completed: 2
  files_changed: 3
---

# Phase 04 Plan 03: .zwo XML Builder and Export Route Handler Summary

Pure .zwo XML builder module with full unit coverage (37 tests) and a GET export route handler with auth gate, IDOR guard, and correct file response headers — completing the "session → bike" half of Phase 4.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for zwo builder, escaping, block mapping | f9fd2ea | tests/zwo-export.test.ts |
| 1 (GREEN) | zwo.ts — xmlEscape, sanitizeFilename, buildZwoXml | fbbd8f4 | src/lib/training/zwo.ts |
| 2 | Export Route Handler with auth + IDOR + file response | 7835eb1 | src/app/api/session/[id]/export/route.ts |

## Verification Results

- `npx vitest run tests/zwo-export.test.ts` — 37 tests pass (xmlEscape, block mapping, powerFraction precision, null notes, XML escaping, sanitizeFilename)
- `npx vitest run` — 146 tests pass (no regressions across full suite)
- `npx tsc --noEmit --skipLibCheck` — 0 errors in src/ (pre-existing test file errors in tests/auth.test.ts, tests/schema.test.ts are unrelated to this plan, confirmed in Plan 01 Summary)
- All acceptance criteria verified: GET handler contains `await params`, `findTrainingSession(ironSession.id, id)`, 401/404 branches, `Content-Type: application/xml`, `attachment; filename=...zwo`

## Deviations from Plan

None. Plan executed exactly as written.

## Known Stubs

None. This plan creates pure utility modules and a Route Handler — no UI rendering with empty/placeholder data.

## Threat Flags

No new threat surface beyond what the plan's threat model registers. All 5 threats addressed:

| Threat ID | Mitigation | Verified |
|-----------|------------|---------|
| T-04-03 | findTrainingSession(ironSession.id, id) — and() guard, 404 on no-match | route.ts line 42–45 |
| T-04-04 | userId from iron-session only, never URL params | route.ts line 31–37 |
| T-04-05 | 401 returned before any DB fetch | route.ts line 32–37 |
| T-04-06 | xmlEscape() on title and notes before interpolation | zwo.ts, tested in 37 tests |
| T-04-SC | No new packages introduced | confirmed |

## Self-Check: PASSED

- src/lib/training/zwo.ts: FOUND
- tests/zwo-export.test.ts: FOUND
- src/app/api/session/[id]/export/route.ts: FOUND
- Commits f9fd2ea (RED), fbbd8f4 (GREEN), 7835eb1 (route handler): all in git log
