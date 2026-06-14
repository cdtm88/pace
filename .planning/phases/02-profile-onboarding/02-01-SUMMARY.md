---
phase: 02-profile-onboarding
plan: 01
subsystem: data-layer
tags: [schema, migration, zones, validation, drizzle, zod]
dependency_graph:
  requires: [01-03]
  provides: [user_profiles schema, profileSchema, computeZones, findUserProfileByUserId]
  affects: [02-02, 02-03, 03-xx, 04-xx]
tech_stack:
  added: []
  patterns: [drizzle-migration, zod-v4-coerce, coggan-zones]
key_files:
  created:
    - src/lib/db/schemas/profile.ts
    - src/lib/training/zones.ts
    - tests/zones.test.ts
    - tests/profile.test.ts
    - drizzle/0001_simple_mantis.sql
    - drizzle/meta/0001_snapshot.json
  modified:
    - src/lib/db/schema.ts
    - src/lib/db/queries.ts
    - tests/schema.test.ts
    - drizzle/meta/_journal.json
decisions:
  - "userId on user_profiles gets .unique() — prerequisite for onConflictDoUpdate in Plan 02 (T-02-03)"
  - "onboarding_complete boolean NOT NULL DEFAULT false — safe migration on existing rows (T-02-02)"
  - "findUserProfileByUserId uses single eq() — userId IS the resource identifier, and() rule exemption documented (T-02-01)"
  - "computeZones(0) returns null — falsy guard covers 0 as invalid FTP alongside null/undefined"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_changed: 10
---

# Phase 02 Plan 01: Data Layer — Schema, Zones, Validation Summary

**One-liner:** Extended user_profiles schema with 5 profile columns + unique constraint, generated migration 0001, added Coggan 7-zone pure utility, Zod profileSchema, and findUserProfileByUserId query helper; 59 tests green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend user_profiles schema + generate migration | 6a7a7e1 | schema.ts, 0001_simple_mantis.sql, schema.test.ts |
| 2 | Coggan zones utility + zones.test.ts | 617484e | zones.ts, zones.test.ts |
| 3 | Zod profileSchema + findUserProfileByUserId + profile.test.ts | a986849 | schemas/profile.ts, queries.ts, profile.test.ts |

## What Was Built

**Schema changes (`src/lib/db/schema.ts`):**
- Added `integer`, `real`, `boolean` imports from drizzle-orm/pg-core
- Added `.unique()` to `userProfiles.userId` (prerequisite for Plan 02 upsert)
- Added columns: `ftp` (integer, nullable), `weight` (real, nullable), `goals` (text, nullable), `injuries` (text, nullable), `onboardingComplete` (boolean NOT NULL DEFAULT false)

**Migration (`drizzle/0001_simple_mantis.sql`):**
- Adds all 5 columns with `DEFAULT false NOT NULL` on onboarding_complete
- Adds `UNIQUE("user_id")` constraint on user_profiles
- Non-destructive — safe for existing Phase 1 rows

**Zones utility (`src/lib/training/zones.ts`):**
- `computeZones(ftp)` — returns 7 PowerZone objects or null when ftp falsy
- `getZoneForWatts(watts, ftp)` — returns matching zone or null
- Pure TypeScript, zero dependencies

**Profile schema (`src/lib/db/schemas/profile.ts`):**
- `profileSchema` with goals required (min 1, exact error message), injuries optional (default ""), ftp/weight coerced optional numbers
- `ProfileInput` type export

**Query helper (`src/lib/db/queries.ts`):**
- `findUserProfileByUserId(userId)` — single `eq()` lookup, returns row or null

## Verification

- `npx vitest run`: 59 tests across 6 files, all green
- Migration SQL verified: contains `onboarding_complete boolean DEFAULT false NOT NULL` and `ADD CONSTRAINT ... UNIQUE("user_id")`
- No new npm packages installed (zero installs this plan)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan is data-layer only; no UI or action stubs produced.

## Threat Flags

None — all threat mitigations from the plan's threat model are implemented:
- T-02-01: findUserProfileByUserId uses single eq() with IDOR exemption documented
- T-02-02: onboarding_complete DEFAULT false — safe on existing rows
- T-02-03: .unique() on userId added as onConflictDoUpdate prerequisite
- T-02-SC: Zero npm installs

## Self-Check: PASSED

- [x] src/lib/db/schema.ts exists with new columns
- [x] src/lib/training/zones.ts exists and exports computeZones, getZoneForWatts
- [x] src/lib/db/schemas/profile.ts exists and exports profileSchema, ProfileInput
- [x] src/lib/db/queries.ts exports findUserProfileByUserId
- [x] drizzle/0001_simple_mantis.sql exists
- [x] tests/zones.test.ts and tests/profile.test.ts exist and pass
- [x] Commits 6a7a7e1, 617484e, a986849 verified in git log
