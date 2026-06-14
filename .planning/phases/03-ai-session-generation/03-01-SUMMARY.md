---
phase: 03-ai-session-generation
plan: "01"
subsystem: ai-session-generation
tags: [schema, validation, safety-gate, ratelimit, migration, tdd]
dependency_graph:
  requires:
    - 02-profile-onboarding/02-03 (userProfiles table, findUserProfileByUserId)
    - 01-foundation/01-03 (Drizzle query patterns, queries.ts structure)
  provides:
    - GeneratedSessionSchema (Zod D-03 bounds validation)
    - validateSessionSafety (deterministic safety gate D-04)
    - generationLimiter (per-user 10/24h D-10)
    - findLatestSessionByUserId (IDOR-safe latest session query)
    - training_sessions migration 0002 (D-01 columns on live DB)
  affects:
    - 03-02 (generateSessionAction uses all 5 artifacts above)
    - 03-03 (SessionGenerator component reads latest session)
tech_stack:
  added:
    - jsonb column type (drizzle-orm/pg-core) — first use in this project
  patterns:
    - TDD red/green cycle (failing test then implementation then green)
    - Zod v4 safeParse + error.issues (not .errors)
    - UPSTASH_AVAILABLE fail-open guard (extended to generationLimiter)
    - Drizzle single eq() exemption for latest-by-userId queries
key_files:
  created:
    - src/lib/db/schemas/session.ts
    - src/lib/safety-gate.ts
    - tests/session-schema.test.ts
    - tests/safety-gate.test.ts
    - drizzle/0002_quick_thunderbolt_ross.sql
    - drizzle/meta/0002_snapshot.json
  modified:
    - src/lib/ratelimit.ts (generationLimiter appended)
    - src/lib/db/queries.ts (findLatestSessionByUserId + desc import)
    - src/lib/db/schema.ts (jsonb import + 6 D-01 columns)
    - drizzle/meta/_journal.json (idx 2 entry)
    - tests/ratelimit.test.ts (generationLimiter describe block added)
decisions:
  - "Zod max for powerFraction is 1.8; safety gate tightens to 1.5 — two independent layers per D-04 defense-in-depth"
  - "findLatestSessionByUserId uses single eq() (same exemption as findUserProfileByUserId — no secondary resource id)"
  - "jsonb column type used for blocks array — allows structured block data without separate join table"
  - "rawJson column nullable text (debug only) — never displayed to user per D-01 spec"
metrics:
  duration: "4 minutes"
  completed: "2026-06-14T18:16:59Z"
  tasks_completed: 3
  files_created: 6
  files_modified: 5
---

# Phase 3 Plan 1: Validation and Persistence Foundation Summary

One-liner: Zod output schema (D-03) + deterministic safety gate (D-04) + per-user generation rate limiter (D-10) + `findLatestSessionByUserId` + `training_sessions` migration 0002 applied to live Neon DB — all pure logic and schema, no Anthropic dependency, fully TDD green.

## What Was Built

### Task 1: Zod Session Schema + Safety Gate (TDD)

**Files:** `src/lib/db/schemas/session.ts`, `src/lib/safety-gate.ts`, `tests/session-schema.test.ts`, `tests/safety-gate.test.ts`

- `SessionBlockSchema` and `GeneratedSessionSchema` per D-03: powerFraction bounds [0.1, 1.8], durationSec max 5400, totalDurationSec max 14400, required fields, enum validation for `type` and `rpe`.
- `GeneratedSession` inferred type exported for use by Plan 02 Server Action and safety gate.
- `validateSessionSafety` implements all 4 D-04 checks in sequence: total duration ceiling (defense-in-depth), powerFraction > 1.5 (tighter than Zod's 1.8), more than 3 consecutive work blocks, fewer than 2 blocks. Returns `{ safe: boolean; reason?: string }` — reason is server-log only.
- 16 tests green: 10 schema cases + 6 safety gate cases covering all behavior spec items.

### Task 2: generationLimiter + findLatestSessionByUserId (TDD)

**Files:** `src/lib/ratelimit.ts` (extended), `src/lib/db/queries.ts` (extended), `tests/ratelimit.test.ts` (extended)

- `generationLimiter` appended to `ratelimit.ts` following existing `UPSTASH_AVAILABLE` guard pattern: `slidingWindow(10, "24 h")`, prefix `rl:generate:user`. Key is userId from iron-session — never client-supplied.
- `findLatestSessionByUserId` added to `queries.ts`: `desc(trainingSessions.createdAt)` orderBy + `limit(1)`. Single `eq()` exemption documented (no secondary resource id). `desc` added to drizzle-orm import.
- 12 ratelimit tests green (9 existing + 3 new generationLimiter assertions).

### Task 3: Extend trainingSessions Schema + Migration (BLOCKING)

**Files:** `src/lib/db/schema.ts` (modified), `drizzle/0002_quick_thunderbolt_ross.sql` (generated), `drizzle/meta/_journal.json` (updated)

- Added `jsonb` to `drizzle-orm/pg-core` import.
- Replaced stale Phase 5 placeholder comment with accurate D-01 column list.
- Injected 6 D-01 columns between `userId` and `createdAt` following userProfiles ordering convention: `title`, `notes`, `readinessScore`, `blocks`, `totalDurationSec`, `rawJson`.
- `drizzle-kit generate` produced `0002_quick_thunderbolt_ross.sql` with 6 ALTER TABLE training_sessions ADD COLUMN statements.
- `drizzle-kit migrate` applied migration to live Neon DB. No pending migrations remain.
- 78 tests green (full suite, no regressions).

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan explicitly specifies. All T-03-01 through T-03-04 mitigations are in place:

- T-03-01: `GeneratedSessionSchema.safeParse` defined (Plan 02 wires the parse call)
- T-03-02: `validateSessionSafety` enforces 4 D-04 checks independently of Zod
- T-03-03: `generationLimiter` 10/24h sliding window keyed on userId
- T-03-04: `findLatestSessionByUserId` filters by userId from iron-session only

## Known Stubs

None. All artifacts are complete implementations:
- `GeneratedSessionSchema` and `validateSessionSafety` are complete logic, not placeholders.
- `generationLimiter` uses live UPSTASH_AVAILABLE guard (fail-open in dev, live in prod).
- `findLatestSessionByUserId` is a real Drizzle query returning null when no sessions exist.
- Migration 0002 is applied to live DB — no pending migrations.

## TDD Gate Compliance

- RED gate: `test(03-01)` commits exist at 0f32992 and 8570af7
- GREEN gate: `feat(03-01)` commits exist at e0bffb1 and fc3f5d5
- REFACTOR gate: not needed (code was clean on first pass)

## Self-Check: PASSED

All 9 created/modified source files confirmed on disk. All 5 task commits verified in git log.
