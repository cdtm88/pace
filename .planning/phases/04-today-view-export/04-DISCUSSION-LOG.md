# Phase 4: Today View & Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 04-today-view-export
**Areas discussed:** Today view entry point, Block navigation model, Export button placement, Pre-ride summary layout

---

## Today View Entry Point

### Q1 — How does the user reach the Today view after generation?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-navigate after generation | generateSessionAction success immediately redirects to /today | ✓ |
| Manual tap on summary card | Dashboard shows session card with 'View session' tap target | |
| Both paths | Auto-navigate on first generation, plus persistent card for re-entry | |

**User's choice:** Auto-navigate after generation

### Q2 — Route structure?

| Option | Description | Selected |
|--------|-------------|----------|
| /today (top-level) | Clean URL; loads latest session via findLatestSessionByUserId() | |
| /session/[id] | Deep-linkable by session ID; more flexible | ✓ |

**User's choice:** /session/[id]

### Q3 — Where does auto-navigate land with /session/[id]?

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to /session/[newSessionId] | generateSessionAction returns the new session ID; direct redirect | ✓ |
| Redirect to /today which redirects to /session/[id] | Two-hop redirect; clean bookmark URL | |

**User's choice:** Redirect to /session/[newSessionId]

---

## Block Navigation Model

### Q1 — How does the user navigate through blocks?

| Option | Description | Selected |
|--------|-------------|----------|
| Tap to advance | Single large current-block display; tap anywhere to advance; block counter | ✓ |
| Scrollable block list | All blocks visible; user scrolls to current one | |
| Static overview | Shows all blocks as list summary; no 'current block' concept | |

**User's choice:** Tap to advance

### Q2 — Where is the advance tap target?

| Option | Description | Selected |
|--------|-------------|----------|
| Tap the entire watt display area | Maximum touch area; no dedicated button needed | ✓ |
| Dedicated Next button at bottom | Standard button within thumb reach | |
| Both | Full-screen tap + visible Next button for affordance | |

**User's choice:** Tap the entire watt display area

### Q3 — What happens past the last block?

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'Session complete' screen | Full-screen completion state with 'Back to dashboard' | ✓ |
| Loop back to block 1 | Restarts the session | |
| Nothing — last block stays | Simplest; user navigates away manually | |

**User's choice:** Show 'Session complete' screen

---

## Export Button Placement

### Q1 — Where does the Export .zwo button live?

| Option | Description | Selected |
|--------|-------------|----------|
| On the pre-ride summary screen | Export is a before-you-ride action; natural workflow | ✓ |
| Inside the Today view itself | Accessible via overflow menu or header during ride | |
| Both | Pre-ride and during ride | |

**User's choice:** On the pre-ride summary screen

### Q2 — How is the .zwo file delivered?

| Option | Description | Selected |
|--------|-------------|----------|
| Route Handler download | GET /api/session/[id]/export; server builds XML; Content-Disposition: attachment | ✓ |
| Client-side Blob generation | JS builds XML string; creates Blob URL; triggers download | |

**User's choice:** Route Handler download

---

## Pre-Ride Summary Layout

### Q1 — Screen structure?

| Option | Description | Selected |
|--------|-------------|----------|
| Header + block list + action row | Title, TSS badge, scrollable block list, Export + Start buttons | ✓ |
| Full-screen summary card | Single card with title, TSS, block count; no block detail | |
| Dashboard-embedded | Summary card expands in-place; no navigation | |

**User's choice:** Header + block list + action row

### Q2 — TSS / intensity preview format?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline badge row | '~67 TSS • 1h 15m' or 'Moderate • 1h 15m'; compact and scannable | ✓ |
| Prominent stat block | Two large numbers side by side (TSS + duration) | |
| You decide | Leave exact layout to Claude | |

**User's choice:** Inline badge row

### Q3 — Block row detail level?

| Option | Description | Selected |
|--------|-------------|----------|
| Type + duration + zone/RPE | 'Work • 10 min • Z4 / Threshold' or 'Work • 10 min • Hard' | ✓ |
| Duration + watts only | '10 min @ 220W'; no zone, no type | |
| Full block description | Includes Claude-generated description text per block | |

**User's choice:** Type + duration + zone/RPE

---

## Claude's Discretion

- Exact Tailwind sizing for the large watt numeral
- COPY key names in `src/lib/copy.ts` for new user-visible strings
- Exact color/style for zone label badge
- Sticky action row implementation (CSS vs. flex)
- Whether to extract `<SessionBlockRow>` sub-component or inline JSX
- Whether pre-ride and riding sub-states split into separate files

## Deferred Ideas

- Timer / auto-advance (countdown per block) — Phase 6 or v2
- Session complete → "Log effort" prompt — Strava auto-match is the v1 mechanism
- Session history list — v2 requirement
