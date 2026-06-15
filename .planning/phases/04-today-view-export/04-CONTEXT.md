# Phase 4: Today View & Export - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the on-bike session experience: a pre-ride summary screen at `/session/[id]` (block list, TSS/intensity badge, export button), a tap-to-advance block-by-block Today view (large watt numeral, zone/RPE label, sequence context), a "Session complete" end state, and a Route Handler that builds and downloads a Zwift-compatible `.zwo` file.

**In scope:** `src/app/(app)/session/[id]/` page (pre-ride + Today view), `/api/session/[id]/export` Route Handler, TSS utility function, `.zwo` XML builder, `getZoneForWatts()` integration for zone labels, "Session complete" state.

**Out of scope:** Session history list (v2), Strava activity matching (Phase 5), PWA service worker and safe-area polish (Phase 6), timer/auto-advance (user advances manually).

</domain>

<decisions>
## Implementation Decisions

### Routing & Entry Point

- **D-01:** Route pattern: `src/app/(app)/session/[id]/page.tsx`. Dynamic segment `[id]` is the training session UUID. IDOR guard mandatory: `findTrainingSession(userId, id)` with `and()` — same pattern as Phase 1 `findTrainingSession()`.
- **D-02:** After `generateSessionAction` succeeds, redirect directly to `/session/${newSession.id}`. No intermediate `/today` route. The action already returns the persisted session — planner uses the `id` field for the redirect URL.
- **D-03:** Dashboard card (Phase 3 summary card) should display a "View session" link to `/session/[latestSession.id]` for re-entry after the initial redirect. Use `findLatestSessionByUserId()` — already in `queries.ts`.

### Block Navigation Model (Today View)

- **D-04:** The session detail page has two sub-states:
  1. **Pre-ride view** — shown on initial load. Displays header, block list, export button, and "Start session" button.
  2. **Riding view** — entered when the user taps "Start session". Shows current block full-screen with tap-to-advance interaction.
  Manage sub-state with `useState` in a Client Component wrapper. No URL change between sub-states.
- **D-05:** Riding view interaction:
  - The entire watt display area is the tap target — tapping it advances to the next block.
  - No dedicated "Next" button needed.
  - Block counter (e.g., "2 / 6") visible in riding view for sequence context.
  - When the user taps past the last block → switch to a "Session complete" state (same page, no navigation).
- **D-06:** "Session complete" state: full-screen message with a "Back to dashboard" link (`/dashboard`). Keep it simple — Phase 5 will add Strava match status here.

### Pre-Ride Summary Screen

- **D-07:** Pre-ride screen layout (top → bottom):
  1. Session title (from `trainingSessions.title`)
  2. Inline badge row: `~{estimatedTSS} TSS • {totalDuration}` when FTP is set; `{intensity} • {totalDuration}` when FTP is absent (e.g., "Moderate • 1h 15m")
  3. Scrollable block list — each row: `{type} • {duration} • {zoneLabel}` (e.g., "Work • 10 min • Z4 / Threshold" or "Work • 10 min • Hard")
  4. Action row (bottom, sticky): "Export .zwo" button + "Start session" button

- **D-08:** Block list row format:
  - FTP set: `{type} • {duration} • {zone.label} / {zone.name}` (e.g., "Work • 10 min • Z4 / Threshold")
  - FTP absent: `{type} • {duration} • {rpe}` (e.g., "Work • 10 min • Hard")
  - Use `getZoneForWatts(block.targetWatts, ftp)` from `src/lib/training/zones.ts` — already implemented.

### Riding View (Today / On-Bike Display)

- **D-09:** Riding view layout for each block:
  - Very large watt numeral (primary) — `targetWatts` from the block
  - Zone label (secondary) — `Z4 / Threshold` (FTP set) or `Hard` (FTP absent)
  - Block type label (tertiary) — "Work", "Rest", "Warmup", "Cooldown"
  - Block duration (tertiary) — formatted as "10 min"
  - Block counter (tertiary) — "2 / 6"
  - Entire watt area is tappable (see D-05)

### TSS Calculation

- **D-10:** Estimated TSS utility function, implemented in `src/lib/training/tss.ts`:
  - Formula: `TSS = (durationSec * NP^2 / FTP^2) × IF × 100 / 3600`
  - Simplified for interval sessions: treat `IF = avgPowerFraction` computed from blocks (weighted average of `powerFraction` by `durationSec`), then `TSS = durationSec × IF² × 100 / 3600`
  - Returns `null` when FTP is absent — PROG-01 RPE path shows intensity label instead
  - Intensity label mapping: avgPowerFraction < 0.65 → "Easy"; 0.65–0.80 → "Moderate"; 0.80–0.95 → "Hard"
  - Display: round TSS to nearest integer; prefix `~` to signal it's an estimate (e.g., `~67 TSS`)

### .zwo Export

- **D-11:** Route Handler at `src/app/api/session/[id]/export/route.ts`. `GET` method. IDOR guard: read `userId` from iron-session (`getIronSession(await cookies(), sessionOptions)`), call `findTrainingSession(userId, id)`. Returns 404 on no-match (consistent with IDOR policy).

- **D-12:** `.zwo` XML structure:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <workout_file>
    <author>Pace</author>
    <name>{XML-escaped session title}</name>
    <description>{XML-escaped session notes or ""}</description>
    <sportType>bike</sportType>
    <workout>
      <!-- one element per block, type mapped to Zwift workout element -->
      <Warmup Duration="{durationSec}" PowerLow="{powerFraction}" PowerHigh="{powerFraction}"/>
      <SteadyState Duration="{durationSec}" Power="{powerFraction}"/>
      <Cooldown Duration="{durationSec}" PowerLow="{powerFraction}" PowerHigh="{powerFraction}"/>
    </workout>
  </workout_file>
  ```
  Block type → Zwift element mapping:
  - `warmup` → `<Warmup>`
  - `work` → `<SteadyState>`
  - `rest` → `<SteadyState>` (low powerFraction)
  - `cooldown` → `<Cooldown>`
  `powerFraction` from the stored block — always present (Phase 3 D-02). XML escaping: `&`, `<`, `>`, `"`, `'` escaped in all user-supplied text fields.

- **D-13:** Response headers: `Content-Type: application/xml`, `Content-Disposition: attachment; filename="{sanitized-title}.zwo"`. Filename sanitized: strip non-alphanumeric-non-hyphen-non-underscore characters; max 50 chars.

### Error Messages (user-visible)

- Session not found: 404 (notFound() — consistent with IDOR policy)
- Export failure (server error): 500 with JSON `{ error: "Export failed. Please try again." }`

### Claude's Discretion

- Exact Tailwind sizing for the large watt numeral (suggest `text-[120px]` or similar, high contrast)
- COPY key names in `src/lib/copy.ts` for any new user-visible strings
- Exact color/style for zone label badge vs. plain text
- Exact sticky action row implementation (CSS `position: sticky` vs. flex layout)
- Whether to extract a `<SessionBlockRow>` sub-component or inline the block row JSX
- Whether pre-ride and riding sub-states live in the same file or split into `session-pre-ride.tsx` / `session-riding.tsx` client components

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Today View — TODAY-01, TODAY-02, TODAY-03, PROG-01 (the 4 requirements for this phase)
- `.planning/ROADMAP.md` §Phase 4 — success criteria (4 conditions that must be true)

### Phase 3 Decisions (carry forward)
- `.planning/phases/03-ai-session-generation/03-CONTEXT.md` — D-01 (block schema), D-02 (powerFraction/targetWatts dual-path), D-09 (action pipeline; today we extend the redirect), D-12 (dashboard session summary card — add "View session" link)

### Existing Code — read before implementing
- `src/lib/training/zones.ts` — `getZoneForWatts()` and `computeZones()` already implemented; use as-is
- `src/lib/ai/compute-watts.ts` — `NO_FTP_REFERENCE_WATTS = 150` constant; `powerFraction` on stored blocks always comes from this
- `src/lib/db/schemas/session.ts` — `SessionBlockSchema` and `GeneratedSession` types
- `src/lib/db/queries.ts` — `findTrainingSession()`, `findLatestSessionByUserId()` (IDOR-safe)
- `src/lib/db/schema.ts` — `trainingSessions` table shape (all Phase 3 D-01 columns present)
- `src/lib/session.ts` — `sessionOptions`, `SessionData` type (used in export Route Handler)

### Security Policy
- `.planning/phases/01-foundation/01-CONTEXT.md` §IDOR — `and()` pattern; 404 not 403; `findTrainingSession(userId, id)` is the correct query shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/training/zones.ts` → `getZoneForWatts(watts, ftp)`: returns `PowerZone | null`. Use for block zone labels in both pre-ride list and riding view.
- `src/components/ui/card.tsx`: existing Card primitive — use for pre-ride block list rows and session complete card.
- `src/components/ui/button.tsx`: existing Button — use for "Export .zwo" and "Start session" actions.
- `src/lib/db/queries.ts` → `findLatestSessionByUserId(userId)`: feeds "View session" link on dashboard re-entry.
- `src/lib/db/queries.ts` → `findTrainingSession(userId, id)`: the IDOR-safe single-session fetch for `/session/[id]` and export Route Handler.

### Established Patterns
- IDOR guard: `and(eq(table.userId, userId), eq(table.id, id))` — never split into chained `.where()` calls (Phase 1 truth-condition).
- auth in RSC: `getIronSession(await cookies(), sessionOptions)` — `cookies()` is async in Next.js 16.
- COPY pattern: all user-visible strings go in `src/lib/copy.ts` as exported constants.
- Error display: `src/components/ui/error-banner.tsx` already exists.
- Server Actions for mutations, Route Handlers for file responses (export) and non-mutation API endpoints.

### Integration Points
- `src/app/(app)/dashboard/page.tsx` → add "View session" link to the Phase 3 session summary card (D-03); pass `findLatestSessionByUserId()` result.
- `src/lib/actions/session.ts` → `generateSessionAction` → update to return `{ data: { id: string }, error?: string }` and redirect to `/session/${id}` on success (D-02).
- `src/app/(app)/session/[id]/page.tsx` → new RSC page; reads session from DB, renders `<SessionDetail>` Client Component.
- `src/app/api/session/[id]/export/route.ts` → new Route Handler; reads session, builds XML, returns file.

</code_context>

<specifics>
## Specific Ideas

- Pre-ride badge row example: `~67 TSS • 1h 15m` (FTP set) or `Moderate • 1h 15m` (no FTP)
- Pre-ride block row example: `Work • 10 min • Z4 / Threshold` or `Work • 10 min • Hard`
- Riding view: entire watt display area = tap target (no dedicated Next button)
- Block counter: "2 / 6" format
- Session complete: simple full-screen state with "Back to dashboard" — Phase 5 will add Strava match info here
- Export filename: sanitized session title + `.zwo` (e.g., `threshold-ladder-45-min.zwo`)

</specifics>

<deferred>
## Deferred Ideas

- Timer / auto-advance (countdown per block) — Phase 6 PWA polish or v2; manually advancing is correct for v1
- Session complete → "Log effort" prompt — out of scope (Strava auto-match is the logging mechanism in v1)
- Session history list — v2 requirement; out of scope for v1

</deferred>

---

*Phase: 4-today-view-export*
*Context gathered: 2026-06-15*
