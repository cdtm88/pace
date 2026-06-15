---
phase: 05-activity-upload
plan: "01"
subsystem: database-schema-fit-utils
tags: [drizzle, schema, migration, vitest, pure-functions, idor, tdd]
dependency_graph:
  requires: []
  provides:
    - activityUploads Drizzle table (schema.ts)
    - drizzle/0003_activity_uploads.sql migration (DROP strava_connections + CREATE activity_uploads)
    - insertActivityUpload / findActivityUploadsByUserId / deleteActivityUpload / setUploadMatch query helpers
    - estimateRideTSS pure function (src/lib/fit/tss.ts)
    - matchActivity pure function + FitSession/MatchableSession interfaces (src/lib/fit/match.ts)
    - vitest config with @ alias (already existed; verified usable)
    - 4 fit test files (tss, match green; parse, tss-chart-data as todo scaffolds)
  affects:
    - Wave 2 (upload Route Handler) — depends on insertActivityUpload, schema shape
    - Wave 3 (TSS chart) — depends on findActivityUploadsByUserId, matchActivity
tech_stack:
  added: []
  patterns:
    - "IDOR guard: and(eq(userId), eq(id)) single-call pattern for deleteActivityUpload and setUploadMatch"
    - "TDD: RED commit (test files) → GREEN commit (implementation files)"
    - "SET NULL FK on matchedSessionId: deleting a session unlinks the match, never deletes the ride record"
key_files:
  created:
    - src/lib/fit/tss.ts
    - src/lib/fit/match.ts
    - src/lib/fit/tss.test.ts
    - src/lib/fit/match.test.ts
    - src/lib/fit/parse.test.ts
    - src/lib/fit/tss-chart-data.test.ts
    - drizzle/0003_activity_uploads.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/db/queries.ts
    - drizzle/meta/_journal.json
    - tests/schema.test.ts
    - tests/idor.test.ts
    - tests/auth.test.ts
decisions:
  - "Migration written manually: drizzle-kit generate requires TTY (interactive rename resolution). SQL written to match exact Drizzle output format used in 0000_groovy_maximus.sql."
  - "vitest.config.ts already existed with @ alias and node environment — no changes needed."
  - "Pre-existing TS errors in tests/ fixed as Rule 1 (blocked tsc --noEmit): auth.test.ts TS2352/TS2554, schema.test.ts TS7053 symbol indexing."
metrics:
  duration: "449s (~7 min)"
  completed: "2026-06-15"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 13
---

# Phase 05 Plan 01: Wave 1 Infrastructure Summary

Wave 1 infrastructure for .fit upload: `activityUploads` schema + migration, IDOR-safe query helpers, `estimateRideTSS` and `matchActivity` pure functions, and vitest test suite.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 (RED) | Add failing tests for estimateRideTSS, matchActivity, parse/tss-chart-data scaffolds | 64a92bb | done |
| 1 (GREEN) | Implement estimateRideTSS and matchActivity pure functions | 6af2d07 | done |
| 2 | Replace stravaConnections with activityUploads in schema + queries; generate migration | 5dfd20f | done |
| 3 | Checkpoint: apply migration to Neon DB | — | awaiting human |

## Task 3 — Pending Human Action

Migration `drizzle/0003_activity_uploads.sql` has been generated and is ready to apply:

```
npx drizzle-kit migrate
```

This requires:
- `DATABASE_URL_UNPOOLED` env var (for migrations per CLAUDE.md)
- Confirmation that `strava_connections` has no rows worth preserving (it was a Phase 0 skeleton, never written to)

The migration:
1. `DROP TABLE "strava_connections"` — removes the skeleton table
2. `CREATE TABLE "activity_uploads"` with all D-04 columns, both FK constraints, and userId index

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing TS compilation errors blocking tsc --noEmit**
- **Found during:** Task 2 (tsc verification step)
- **Issue:** `tests/auth.test.ts` had TS2352 (Error cast without unknown intermediate) and TS2554 (POST called with 1 arg when it takes 0). `tests/schema.test.ts` had TS7053 (Symbol.for() keys not in PgTable index signature) across all existing table tests.
- **Fix:** Cast via `unknown` intermediate in auth.test.ts; POST() → POST(); refactored schema.test.ts to use `drizzleCols()`/`drizzleName()` helper functions that cast to `unknown` first.
- **Files modified:** `tests/auth.test.ts`, `tests/schema.test.ts`
- **Commit:** 5dfd20f

**2. [Rule 1 - Bug] tests/idor.test.ts referenced dropped findStravaConnection**
- **Found during:** Task 2 (tsc verification step)
- **Issue:** `findStravaConnection` removed from queries.ts; TS2305 in idor.test.ts
- **Fix:** Replaced `findStravaConnection` → `deleteActivityUpload` IDOR test; updated schema mock to include `activityUploads`; extended db mock to also mock `db.delete()` with `.where().returning()` chain.
- **Files modified:** `tests/idor.test.ts`
- **Commit:** 5dfd20f

**3. [Rule 3 - Blocking] drizzle-kit generate requires TTY**
- **Found during:** Task 2 (migration generation)
- **Issue:** `npx drizzle-kit generate` requires interactive TTY to resolve the `strava_connections` → `activity_uploads` table rename; fails in non-TTY bash environment.
- **Fix:** Wrote migration SQL manually, matching the Drizzle output format from prior migrations. SQL confirmed to contain all required patterns (DROP, CREATE, both FKs, userId index). Also updated `drizzle/meta/_journal.json` with the new migration entry.
- **Files modified:** `drizzle/0003_activity_uploads.sql`, `drizzle/meta/_journal.json`
- **Commit:** 5dfd20f

## Known Stubs

None — this plan creates pure functions and schema only, no UI stubs.

## Threat Flags

None — new threat surface (T-05-01, T-05-02, T-05-03) was already captured in the plan's threat model and mitigated via the IDOR-safe query helpers.

## Verification Results

- `npx tsc --noEmit`: CLEAN
- `npx vitest run src/lib/fit/tss.test.ts src/lib/fit/match.test.ts`: 12/12 PASS
- `npx vitest run src/lib/fit/`: 12 pass, 9 todo (parse + tss-chart-data scaffolds) — correct
- migration file patterns: CREATE TABLE, DROP TABLE, SET NULL FK, userId index — all FOUND
- Actual migration filename: `drizzle/0003_activity_uploads.sql` (matches plan expectation)

## Self-Check: PASSED

All 10 expected files confirmed on disk. All 3 task commits confirmed in git history.
