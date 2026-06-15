---
phase: 05-activity-upload
plan: "02"
subsystem: fit-upload-api
tags: [fit, upload, route-handler, server-action, idor, tss]
dependency_graph:
  requires: [05-01]
  provides: [POST /api/fit/upload, deleteUploadAction, parseFitFile]
  affects: [src/lib/fit/parse.ts, src/app/api/fit/upload/route.ts, src/lib/actions/fit.ts]
tech_stack:
  added: [fit-file-parser@3.0.2]
  patterns: [multipart-upload-route-handler, idor-safe-delete-action, fit-parse-wrapper]
key_files:
  created:
    - src/lib/fit/parse.ts
    - src/app/api/fit/upload/route.ts
    - src/lib/actions/fit.ts
  modified:
    - src/lib/fit/parse.test.ts
    - package.json
    - package-lock.json
decisions:
  - "Buffer passed to parseAsync as ArrayBuffer slice (cast) to satisfy fit-file-parser v3 strict generic Buffer<ArrayBuffer> — no behavior change"
  - "transpilePackages not added — fit-file-parser ESM import works without Turbopack special-casing"
  - "Three concrete invalid-binary rejection tests added; happy-path deferred to Wave 3 browser checkpoint (no real .fit fixture available)"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-15"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
requirements: [UPLOAD-01, UPLOAD-02, UPLOAD-03]
---

# Phase 05 Plan 02: FIT Upload API Layer Summary

FIT file upload API: `parseFitFile` wrapper using fit-file-parser v3 mode:'list', POST Route Handler with auth/size/parse/match/TSS/insert pipeline, and IDOR-guarded `deleteUploadAction` Server Action.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Install fit-file-parser, implement parseFitFile, fill parse.test.ts | dcb58a0 | package.json, parse.ts, parse.test.ts |
| 2 | POST /api/fit/upload Route Handler | 328a316 | route.ts, parse.ts (Buffer fix) |
| 3 | deleteUploadAction Server Action | e89ad3b | src/lib/actions/fit.ts |

## What Was Built

**`src/lib/fit/parse.ts`** — `parseFitFile(buffer: Buffer): Promise<FitSession>` wrapping fit-file-parser v3:
- `new FitParser({ force: true, mode: 'list', ... })` + `parseAsync()`
- Reads `data.sessions?.[0]` for the session message (mode:'list' access path, not cascade)
- Maps: `startedAt = new Date(session.start_time)`, `durationSec = Math.round(total_elapsed_time ?? 0)`, `avgPowerW = avg_power ?? null`
- Throws when no session present → caller returns 400

**`src/app/api/fit/upload/route.ts`** — POST Route Handler:
1. Auth gate: `getIronSession(await cookies(), sessionOptions)` → 401 if no session
2. FormData parse → 400 missing_file / invalid_form_data
3. Size check BEFORE `arrayBuffer()`: `file.size > 4MB` → 413 (Pitfall 1 / T-05-05)
4. `parseFitFile(buffer)` → 400 invalid_fit_file on throw (T-05-06)
5. `matchActivity(fit, sessions)` → `{ id, title } | null` (D-10/D-11)
6. `estimateRideTSS` only when `avgPowerW !== null && profile?.ftp` (D-08)
7. `insertActivityUpload({ userId, ...})` — userId from session only (T-05-04)
8. Returns JSON matching interface_context shape

**`src/lib/actions/fit.ts`** — `deleteUploadAction(uploadId)` Server Action:
- `'use server'` directive
- Auth from `getIronSession` only (IDOR guard upstream)
- `deleteActivityUpload(session.id, uploadId)` — single `and()` call (Pitfall 4 / T-05-07)
- Zero-row result → `{ error: 'not_found' }` without distinguishing cross-user vs missing (D-09)
- `revalidatePath('/dashboard')` on success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Buffer<ArrayBufferLike> type mismatch with fit-file-parser parseAsync**
- **Found during:** Task 2 (tsc --noEmit after writing route.ts)
- **Issue:** `parseFitFile(buffer: Buffer)` where `Buffer` is `Buffer<ArrayBufferLike>` in Node types but `parseAsync` expects `ArrayBuffer | Buffer<ArrayBuffer>` — TypeScript strict generics mismatch
- **Fix:** Extract underlying `ArrayBuffer` slice: `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer`
- **Files modified:** src/lib/fit/parse.ts
- **Commit:** 328a316
- **Behavior:** No runtime change — a Node Buffer's `.buffer` property IS the underlying ArrayBuffer; slicing gives the exact bytes without copying

**2. [Plan note] transpilePackages not needed**
- fit-file-parser ships both ESM (`dist/fit-parser.js`) and CJS (`dist/cjs/fit-parser.js`). Turbopack resolves the ESM entry cleanly. `next.config.ts` is unchanged.

**3. [Plan note] Happy-path tests deferred to Wave 3**
- Constructing a valid synthetic FIT binary requires encoding FIT protocol framing (magic bytes + little-endian lengths + CRC). No fixture ships with fit-file-parser. Three concrete invalid-binary rejection tests are real and passing. Happy-path field mapping verified end-to-end at the Wave 3 browser checkpoint.

## Threat Mitigations Applied

| Threat | Component | Mitigation |
|--------|-----------|-----------|
| T-05-04 | POST /api/fit/upload | getIronSession auth gate; userId never from form |
| T-05-05 | Oversized upload | file.size > 4MB check before arrayBuffer() → 413 |
| T-05-06 | Malformed FIT | try/catch around parseFitFile → 400 invalid_fit_file |
| T-05-07 | deleteUploadAction | deleteActivityUpload uses and(userId, id) single call |
| T-05-08 | Error disclosure | Generic error codes only; internals logged server-side |

## Known Stubs

None. All implemented paths are wired to real DB operations. Wave 3 adds the client UI that calls these endpoints.

## Threat Flags

None. No new network endpoints beyond those in the plan's threat_model.

## Self-Check: PASSED

Files exist:
- src/lib/fit/parse.ts: FOUND
- src/app/api/fit/upload/route.ts: FOUND
- src/lib/actions/fit.ts: FOUND
- src/lib/fit/parse.test.ts: FOUND (modified)

Commits exist:
- dcb58a0: FOUND (feat(05-02): install fit-file-parser...)
- 328a316: FOUND (feat(05-02): POST /api/fit/upload...)
- e89ad3b: FOUND (feat(05-02): deleteUploadAction...)

Verification:
- npx tsc --noEmit: CLEAN
- npx vitest run parse.test.ts: 3 passed, 3 todo
- grep 4MB constant: FOUND in route.ts
- grep getIronSession: FOUND in route.ts and fit.ts
- grep parseFitFile: FOUND in route.ts
- grep insertActivityUpload: FOUND in route.ts
- grep 'use server': FOUND in fit.ts
- grep deleteActivityUpload: FOUND in fit.ts
