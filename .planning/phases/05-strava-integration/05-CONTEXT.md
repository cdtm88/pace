# Phase 5: Activity Upload - Context

**Gathered:** 2026-06-15
**Updated:** 2026-06-15 (replanned from Strava OAuth → .fit file upload; Strava API requires paid subscription)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add .fit file upload, server-side FIT parsing, activity-to-session matching, and a weekly TSS bar chart to the dashboard. This closes the generate → ride → log loop without requiring a Strava API subscription.

**In scope:** .fit file upload Route Handler, `fit-file-parser` server-side parsing, `activity_uploads` table (replaces `strava_connections` skeleton), activity-to-session matching (same UTC day, ±20% duration), delete upload Server Action, recharts weekly TSS bar chart (6-week rolling), COPY keys for upload UI.

**Out of scope:** Strava OAuth (v2 once subscription is viable), Garmin Connect API, bulk import, upload history list page, PWA polish (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Upload Architecture

- **D-01: Upload endpoint:** POST Route Handler at `src/app/api/fit/upload/route.ts`. Receives `multipart/form-data`, reads the file buffer, passes it to `fit-file-parser`, returns JSON with parsed fields and match result. IDOR-guarded via session userId.
- **D-02: File size limit:** 10 MB max (typical .fit file is 100–500 KB; 10 MB covers edge cases without server abuse risk). Return 413 if exceeded.
- **D-03: Client component:** `UploadFitButton` — `<input type="file" accept=".fit">` wrapped in a form, submits via `fetch()` to the Route Handler. Shows loading state during upload, success/error state after. Lives in `src/components/strava/upload-fit-button.tsx` (keep `strava/` directory for v2 migration ease).

### Database Schema

- **D-04: Replace `stravaConnections`:** Drop `strava_connections` table via migration; create `activity_uploads` (id uuid PK, userId uuid FK→users, fileName text, startedAt timestamp, durationSec integer, avgPowerW integer nullable, estimatedTss integer nullable, matchedSessionId uuid nullable FK→training_sessions, createdAt timestamp). One migration file covers both the drop and the create.
- **D-05: No back-reference on training_sessions:** The match is owned by `activity_uploads.matchedSessionId`. No column added to `training_sessions` — avoids a second migration and keeps the sessions table stable.
- **D-06: One upload per session (soft constraint):** If a second upload matches the same session, allow it — overwrite the previous match. No unique constraint; last upload wins. Keeps the UI simple.

### FIT Parsing

- **D-07: Library:** `fit-file-parser` npm package. Pure JS, no native bindings, works in Vercel serverless. Parse in streaming callback mode: collect `record` messages for power/timestamp, read `session` message for total elapsed time and start time.
- **D-08: Extracted fields:** `startedAt` (from session message `start_time`), `durationSec` (from session `total_elapsed_time`), `avgPowerW` (from session `avg_power`, nullable — not all devices record power). TSS estimated server-side using existing `estimateTSS()` when user FTP is set and avgPowerW is present; null otherwise.
- **D-09: Parse errors:** If `fit-file-parser` throws or the file is not a valid FIT binary, return HTTP 400 with `{ error: "invalid_fit_file" }`. Surface as "File couldn't be read — make sure it's a .fit file" in the UI.

### Activity Matching

- **D-10: Match algorithm:** Same as the discarded Strava plan — same UTC calendar date AND `durationSec` within ±20% of `training_sessions.totalDurationSec`. Query the user's sessions, find the best match, write `matchedSessionId`. Pure function in `src/lib/fit/match.ts` (same interface as prior `strava/match.ts`).
- **D-11: No match case:** If no session matches, still store the upload with `matchedSessionId = null`. UI shows "No matching session found for this ride" below the upload confirmation.

### Dashboard UI

- **D-12: Upload section placement:** Below the session generator, above the logout link. Same position as the discarded Strava section. Card title "Log a Ride".
- **D-13: Upload confirmation:** After successful upload, show inline in the card: "Logged — matched to [session title]" (when matched) or "Logged — no session matched for this date" (when unmatched). No page navigation.
- **D-14: TSS chart:** Same spec as before — recharts `BarChart` + `ResponsiveContainer` (300px height), 6-week rolling, one bar per week, `#f97316` (orange-500) bars. Query `activity_uploads` where `matchedSessionId IS NOT NULL` and `userId = session.userId`, group by ISO week.
- **D-15: Empty chart state:** Chart frame renders with centered label "Upload .fit files to see your training load" when no matched uploads exist.

### Claude's Discretion

- Exact Tailwind classes for the upload card and chart container
- COPY key names for upload UI strings (success, no-match, error, delete confirm)
- Whether delete is an inline confirm or a direct action
- Exact file input styling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/session.ts` — `sessionOptions`, `SessionData`; use for auth in Route Handler
- `src/lib/db/queries.ts` — `listTrainingSessions()` already scaffolded; extend with upload helpers
- `src/lib/db/schema.ts` — `stravaConnections` skeleton needs replacement; `trainingSessions` stays unchanged
- `src/lib/training/tss.ts` — `estimateTSS()` already implemented; use for TSS from avgPower + duration + FTP
- `src/components/ui/error-banner.tsx` — use for parse/upload errors
- `src/components/ui/button.tsx` — use for upload trigger and delete
- `src/components/ui/card.tsx` — use for "Log a Ride" section container
- `src/lib/copy.ts` — COPY pattern for all user-visible strings

### Established Patterns
- IDOR guard: `and(eq(table.userId, userId), eq(table.id, id))` — mandatory for resource fetches
- Route Handlers for uploads and GET endpoints; Server Actions for mutations (delete)
- `cookies()` is async in Next.js 16 — `await cookies()` everywhere
- COPY pattern: all user-visible strings in `src/lib/copy.ts`

### Integration Points
- `src/app/(app)/dashboard/page.tsx` — add upload section and TSS chart
- `src/lib/db/schema.ts` — replace `stravaConnections` with `activityUploads`
- `src/lib/db/queries.ts` — add `insertActivityUpload`, `findActivityUploadsByUserId`, `deleteActivityUpload`, `matchSessionToUpload`
- New files needed:
  - `src/lib/fit/parse.ts` — FIT file parsing wrapper around `fit-file-parser`
  - `src/lib/fit/match.ts` — activity-to-session matching pure function
  - `src/app/api/fit/upload/route.ts` — POST Route Handler (multipart, IDOR-guarded)
  - `src/lib/actions/fit.ts` — Server Action: deleteUpload
  - `src/lib/strava/tss-chart-data.ts` → `src/lib/fit/tss-chart-data.ts` — buildWeeklyTSS
  - `src/components/fit/upload-fit-button.tsx` — Client Component for file input
  - `src/components/fit/tss-chart.tsx` — recharts TSS bar chart Client Component

</code_context>

<specifics>
## Specific Ideas

- `fit-file-parser` usage: `new FitParser({ force: true, speedUnit: 'km/h', lengthUnit: 'm', temperatureUnit: 'celsius', elapsedRecordField: true, mode: 'cascade' })` — use `force: true` to tolerate minor file corruption
- Session message fields: `start_time` (Date), `total_elapsed_time` (seconds), `avg_power` (watts, optional)
- TSS formula: `(durationSec × avgPowerW × IF) / (FTP × 3600) × 100` where `IF = avgPowerW / FTP`
- Chart X-axis: week labels like "Jun 9", "Jun 16"
- Bar color: `#f97316` (Tailwind orange-500) — consistent with original Strava chart design
- Weekly TSS computed in-memory (6 weeks × ≤7 sessions — tiny)
- Delete action: `deleteActivityUploadAction(uploadId)` → Server Action with IDOR guard

</specifics>

<deferred>
## Deferred Ideas

- Strava OAuth integration — deferred to v2 once paid subscription is viable (`UPLOAD-V2-01`)
- Upload history list page — v2; dashboard confirmation is sufficient for v1
- Bulk .fit import — v2
- Garmin Connect API direct sync — v2

</deferred>

---

*Phase: 5-activity-upload*
*Context gathered: 2026-06-15*
*Replanned: 2026-06-15 — switched from Strava OAuth to .fit upload*
