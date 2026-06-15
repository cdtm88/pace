# Phase 4: Today View & Export - Research

**Researched:** 2026-06-15
**Domain:** Next.js App Router client state, XML file generation, TSS math, on-bike UI
**Confidence:** HIGH

## Summary

Phase 4 is a pure product feature phase — no new external dependencies required. All infrastructure (DB, auth, zones utility, queries) is already in place from Phases 1–3. The work is: (1) a session detail page with two client-managed sub-states (pre-ride and riding), (2) a TSS utility function, and (3) a Route Handler that streams a `.zwo` XML file download.

The on-bike Today view is a Client Component because block navigation state (`currentBlockIndex`, sub-state enum) lives in the browser. The RSC page layer handles auth and DB fetch; it passes the session + profile data down to a `<SessionDetail>` client wrapper. The export Route Handler is a separate concern — it re-fetches the session server-side with the same IDOR guard used everywhere else in the codebase.

The key complexity areas are: correct XML escaping (hand-rolled is fine because the character set is small and well-defined), TSS formula fidelity (simplified version documented in CONTEXT.md D-10), and the `generateSessionAction` redirect update (D-02: must update the action to redirect to `/session/${id}` on success, which changes its current return-only behavior).

**Primary recommendation:** Build in three self-contained tasks — (1) TSS utility + redirect update, (2) session page (RSC + Client Component), (3) export Route Handler. No new npm packages needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Route: `src/app/(app)/session/[id]/page.tsx`. IDOR guard mandatory: `findTrainingSession(userId, id)` with `and()`.
- **D-02:** After `generateSessionAction` succeeds, redirect to `/session/${newSession.id}`. No intermediate `/today` route.
- **D-03:** Dashboard card adds "View session" link to `/session/[latestSession.id]` via `findLatestSessionByUserId()`.
- **D-04:** Two sub-states managed by `useState` in a Client Component wrapper: pre-ride and riding. No URL change between sub-states.
- **D-05:** Riding view: entire watt display area is the tap target; no dedicated "Next" button; block counter "2 / 6" visible.
- **D-06:** "Session complete" state: full-screen message + "Back to dashboard" link. Phase 5 adds Strava match status here.
- **D-07:** Pre-ride screen layout: title → badge row (TSS or intensity + duration) → scrollable block list → sticky action row.
- **D-08:** Block list row: FTP set → `{type} • {duration} • {zone.label} / {zone.name}`; FTP absent → `{type} • {duration} • {rpe}`.
- **D-09:** Riding view: large watt numeral (primary), zone/RPE label (secondary), block type + duration + counter (tertiary). Entire watt area tappable.
- **D-10:** TSS utility in `src/lib/training/tss.ts`. Formula: `TSS = durationSec × IF² × 100 / 3600` where IF = weighted-average powerFraction. Returns `null` when FTP absent. Intensity label: <0.65 → "Easy"; 0.65–0.80 → "Moderate"; 0.80–0.95 → "Hard". Display: round to integer, prefix `~`.
- **D-11:** Export Route Handler: `src/app/api/session/[id]/export/route.ts`. GET method. IDOR guard required. Returns 404 on no-match.
- **D-12:** `.zwo` XML structure: `warmup` → `<Warmup>`, `work` → `<SteadyState>`, `rest` → `<SteadyState>`, `cooldown` → `<Cooldown>`. `powerFraction` always present on stored blocks. XML-escape all user-supplied text.
- **D-13:** Response headers: `Content-Type: application/xml`, `Content-Disposition: attachment; filename="{sanitized-title}.zwo"`. Filename: strip non-alphanumeric/hyphen/underscore, max 50 chars.
- Error: session not found → `notFound()` (404). Export server error → 500 with `{ error: "Export failed. Please try again." }`.

### Claude's Discretion

- Exact Tailwind sizing for large watt numeral (suggest `text-[120px]` or similar, high contrast)
- COPY key names in `src/lib/copy.ts` for new user-visible strings
- Exact color/style for zone label badge vs. plain text
- Exact sticky action row implementation (CSS `position: sticky` vs. flex layout)
- Whether to extract a `<SessionBlockRow>` sub-component or inline block row JSX
- Whether pre-ride and riding sub-states live in same file or split into `session-pre-ride.tsx` / `session-riding.tsx`

### Deferred Ideas (OUT OF SCOPE)

- Timer / auto-advance (countdown per block) — Phase 6 PWA polish or v2
- Session complete → "Log effort" prompt — Strava auto-match is the logging mechanism in v1
- Session history list — v2 requirement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TODAY-01 | User can view today's generated session with current block's watt target as a glanceable large numeral, with block type, duration, and sequence context secondary | D-04 (sub-state model), D-09 (riding view layout), Client Component with `useState` block index |
| TODAY-02 | When FTP is set, each block displays power zone label (Z1–Z7 + name); when FTP absent, RPE descriptors shown | `getZoneForWatts()` already in `zones.ts`; `rpe` field already on stored blocks (SessionBlockSchema) |
| TODAY-03 | User can export session as Zwift-compatible `.zwo` file; power values as FTP fractions; user-supplied text XML-escaped | D-11 (Route Handler), D-12 (XML structure), D-13 (response headers); `powerFraction` always present (compute-watts.ts) |
| PROG-01 | When FTP set: estimated TSS before ride; when FTP absent: estimated duration + approximate intensity | D-10 (TSS formula), intensity label thresholds, `null` return for no-FTP path |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session data fetch + auth check | API / Backend (RSC) | — | iron-session read + DB query must be server-side; never expose session row to client unfiltered |
| Block navigation state | Browser / Client | — | `currentBlockIndex` and sub-state enum are ephemeral UI state; no persistence needed |
| TSS calculation | API / Backend (server util) | Browser (display only) | Pure math, no I/O; computed server-side in RSC and passed as prop; no client fetch needed |
| Zone label lookup | Browser / Client | API / Backend | `getZoneForWatts()` is pure TS; safe to call in client component; already used server-side in Phase 3 |
| `.zwo` XML generation | API / Backend (Route Handler) | — | File generation is server-only; Route Handler streams response with correct headers |
| IDOR enforcement | API / Backend | — | `findTrainingSession(userId, id)` with `and()` — both RSC page and export Route Handler |
| Dashboard "View session" link | Browser / Client (within RSC page) | — | Link rendered in existing dashboard RSC; data already available from `findLatestSessionByUserId()` |

## Standard Stack

### Core — No New Packages Required

All capabilities in this phase are satisfied by existing project dependencies.

| Capability | Existing Asset | Location |
|------------|----------------|----------|
| Zone labels | `getZoneForWatts(watts, ftp)` | `src/lib/training/zones.ts` |
| Session fetch (IDOR-safe) | `findTrainingSession(userId, id)` | `src/lib/db/queries.ts` |
| Latest session for dashboard link | `findLatestSessionByUserId(userId)` | `src/lib/db/queries.ts` |
| Auth in RSC | `getIronSession(await cookies(), sessionOptions)` | `src/lib/session.ts` |
| Block data shape | `SessionBlockSchema`, `GeneratedSession` | `src/lib/db/schemas/session.ts` |
| powerFraction reference | `NO_FTP_REFERENCE_WATTS = 150` | `src/lib/ai/compute-watts.ts` |
| UI primitives | `Card`, `Button`, `ErrorBanner` | `src/components/ui/` |
| Copy strings | `COPY` constant | `src/lib/copy.ts` |

### Supporting Libraries (already installed)

| Library | Purpose in this phase |
|---------|-----------------------|
| `iron-session` | Read `userId` from session cookie in export Route Handler |
| `drizzle-orm` | `findTrainingSession` uses Drizzle; no new queries needed |
| `next/navigation` | `notFound()` for IDOR 404 responses |
| React `useState` | Block index + sub-state management in Client Component |

**Installation:** No new packages. Run `npm install` only if `node_modules` is missing.

## Package Legitimacy Audit

No new external packages are introduced in this phase. The Package Legitimacy Gate is not required.

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser (tap)
     │
     ▼
/session/[id] RSC (page.tsx)
     │  ├─ getIronSession → userId
     │  ├─ findTrainingSession(userId, id) ──→ null → notFound() → 404
     │  ├─ findUserProfileByUserId(userId) ──→ ftp | null
     │  └─ computeTSS(blocks, ftp) ──→ tss | null
     │
     ▼
<SessionDetail> (Client Component)
     │  ├─ sub-state: "pre-ride" | "riding" | "complete"
     │  ├─ currentBlockIndex: number
     │  │
     │  ├─ PRE-RIDE VIEW
     │  │    ├─ Title
     │  │    ├─ Badge: "~67 TSS • 1h 15m" | "Moderate • 1h 15m"
     │  │    ├─ Block list (mapped, getZoneForWatts per block)
     │  │    └─ [Export .zwo] [Start session] (sticky)
     │  │
     │  ├─ RIDING VIEW
     │  │    ├─ Large watt numeral (tap target → advance block)
     │  │    ├─ Zone label / RPE label
     │  │    ├─ Block type + duration
     │  │    └─ Counter "2 / 6"
     │  │
     │  └─ COMPLETE VIEW
     │       └─ "Session complete" + "Back to dashboard" link
     │
     ▼ (separate request)
GET /api/session/[id]/export
     │  ├─ getIronSession → userId
     │  ├─ findTrainingSession(userId, id) → null → 404
     │  ├─ buildZwoXml(session)
     │  │    ├─ XML-escape title + notes
     │  │    ├─ map blocks → Zwift elements
     │  │    └─ powerFraction always present (compute-watts.ts guarantee)
     │  └─ Response: Content-Type: application/xml
     │               Content-Disposition: attachment; filename="..."
     ▼
Browser downloads .zwo file
```

### Recommended Project Structure

```
src/
├── app/
│   ├── (app)/
│   │   ├── session/
│   │   │   └── [id]/
│   │   │       └── page.tsx         # RSC: auth + DB fetch + computeTSS; renders <SessionDetail>
│   │   └── dashboard/
│   │       └── page.tsx             # MODIFIED: add "View session" link (D-03)
│   └── api/
│       └── session/
│           └── [id]/
│               └── export/
│                   └── route.ts     # Route Handler: XML build + file response
├── components/
│   └── session/
│       ├── session-detail.tsx       # Client Component: sub-state machine + all views
│       └── session-block-row.tsx    # (discretionary) sub-component for block list row
└── lib/
    ├── training/
    │   ├── zones.ts                 # EXISTING — no changes
    │   └── tss.ts                   # NEW: computeTSS(blocks, ftp) utility
    ├── actions/
    │   └── session.ts               # MODIFIED: add redirect to /session/${id} on success
    └── copy.ts                      # MODIFIED: add Phase 4 copy constants
```

### Pattern 1: RSC Page — Auth + DB Fetch + Pass Data Down

```typescript
// src/app/(app)/session/[id]/page.tsx
// Source: established project pattern (dashboard/page.tsx, Phase 1–3)
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findTrainingSession, findUserProfileByUserId } from "@/lib/db/queries";
import { computeTSS } from "@/lib/training/tss";
import { SessionDetail } from "@/components/session/session-detail";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;  // Next.js 16: params is async
}) {
  const { id } = await params;

  const ironSession = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!ironSession.id) redirect("/login");

  // IDOR guard: and() pattern — returns null if session belongs to another user
  const session = await findTrainingSession(ironSession.id, id);
  if (!session) notFound();  // 404, not 403

  const profile = await findUserProfileByUserId(ironSession.id);
  const ftp = profile?.ftp ?? null;

  // TSS computed server-side; passed as prop (no client-side re-computation)
  const tss = computeTSS(session.blocks as SessionBlock[], ftp);

  return <SessionDetail session={session} ftp={ftp} tss={tss} />;
}
```

[ASSUMED] — params typing as `Promise<{id: string}>` in Next.js 16 App Router; confirm against project convention.

### Pattern 2: Client Component Sub-State Machine

```typescript
// src/components/session/session-detail.tsx
"use client";
import { useState } from "react";

type SubState = "pre-ride" | "riding" | "complete";

export function SessionDetail({ session, ftp, tss }) {
  const [subState, setSubState] = useState<SubState>("pre-ride");
  const [blockIndex, setBlockIndex] = useState(0);

  const blocks = session.blocks as SessionBlock[];
  const currentBlock = blocks[blockIndex];

  function advance() {
    if (blockIndex < blocks.length - 1) {
      setBlockIndex(blockIndex + 1);
    } else {
      setSubState("complete");
    }
  }

  if (subState === "pre-ride") return <PreRideView ... />;
  if (subState === "riding") return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center cursor-pointer select-none"
      onClick={advance}
    >
      <span className="text-[120px] font-black leading-none tabular-nums">
        {currentBlock.targetWatts}
      </span>
      {/* zone label, block type, duration, counter */}
    </div>
  );
  return <CompleteView />;
}
```

[ASSUMED] — `text-[120px]` is Claude's discretion per CONTEXT.md; planner should adjust based on mobile viewport testing.

### Pattern 3: TSS Utility

```typescript
// src/lib/training/tss.ts
// Source: CONTEXT.md D-10 formula

type Block = { durationSec: number; powerFraction: number };

/**
 * Estimated TSS for an interval session.
 * Formula: TSS = totalSec × IF² × 100 / 3600
 * where IF = weighted average powerFraction across all blocks.
 * Returns null when ftp is absent (PROF-03 RPE path).
 */
export function computeTSS(
  blocks: Block[],
  ftp: number | null
): number | null {
  if (!ftp) return null;

  const totalSec = blocks.reduce((sum, b) => sum + b.durationSec, 0);
  if (totalSec === 0) return null;

  const weightedIF =
    blocks.reduce((sum, b) => sum + b.powerFraction * b.durationSec, 0) /
    totalSec;

  return Math.round((totalSec * weightedIF * weightedIF * 100) / 3600);
}

/**
 * Intensity label from average powerFraction (PROF-03 no-FTP path).
 * Returns null when ftp is set (TSS is shown instead).
 */
export function computeIntensityLabel(
  blocks: Block[],
  ftp: number | null
): "Easy" | "Moderate" | "Hard" | null {
  if (ftp) return null;

  const totalSec = blocks.reduce((sum, b) => sum + b.durationSec, 0);
  if (totalSec === 0) return null;

  const avgFraction =
    blocks.reduce((sum, b) => sum + b.powerFraction * b.durationSec, 0) /
    totalSec;

  if (avgFraction < 0.65) return "Easy";
  if (avgFraction < 0.80) return "Moderate";
  return "Hard";
}
```

[ASSUMED] — intensity thresholds are exactly as specified in CONTEXT.md D-10; not an independent research finding.

### Pattern 4: .zwo XML Builder

```typescript
// Inline in export/route.ts or extracted to src/lib/training/zwo.ts

/** Escape the 5 XML reserved characters in user-supplied strings. */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function blockTypeToZwiftElement(type: string): string {
  // warmup and cooldown use PowerLow/PowerHigh; work and rest use SteadyState
  if (type === "warmup") return "Warmup";
  if (type === "cooldown") return "Cooldown";
  return "SteadyState"; // work + rest
}

function buildZwoXml(session: TrainingSessionRow): string {
  const blocks = session.blocks as SessionBlock[];

  const blockXml = blocks
    .map((b) => {
      const el = blockTypeToZwiftElement(b.type);
      const pf = b.powerFraction.toFixed(3);
      if (el === "Warmup" || el === "Cooldown") {
        // Zwift uses PowerLow + PowerHigh for ramp elements; use same value for flat power
        return `    <${el} Duration="${b.durationSec}" PowerLow="${pf}" PowerHigh="${pf}"/>`;
      }
      return `    <SteadyState Duration="${b.durationSec}" Power="${pf}"/>`;
    })
    .join("\n");

  const title = xmlEscape(session.title);
  const description = xmlEscape(session.notes ?? "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>Pace</author>
  <name>${title}</name>
  <description>${description}</description>
  <sportType>bike</sportType>
  <workout>
${blockXml}
  </workout>
</workout_file>`;
}
```

[ASSUMED] — Zwift `.zwo` element attribute names (`PowerLow`, `PowerHigh`, `Power`, `Duration`) based on training knowledge; format is well-documented in cycling community but not verified against official Zwift docs in this session.

### Pattern 5: Export Route Handler

```typescript
// src/app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findTrainingSession } from "@/lib/db/queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ironSession = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!ironSession.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await findTrainingSession(ironSession.id, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const xml = buildZwoXml(session);

  // Sanitize filename: alphanumeric, hyphens, underscores only; max 50 chars
  const safeName = session.title
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${safeName}.zwo"`,
    },
  });
}
```

[ASSUMED] — `new NextResponse(xml, { headers })` is correct for string body in Next.js App Router Route Handlers; consistent with established project patterns.

### Pattern 6: generateSessionAction Redirect Update (D-02)

The current `generateSessionAction` in `src/lib/actions/session.ts` returns `{ data: inserted }`. Per D-02, on success it must redirect to `/session/${inserted.id}`.

**Constraint:** This is called via `useTransition` in `SessionGenerator` (a Client Component). `redirect()` called inside a Server Action during `useTransition` throws a Next.js redirect error that React catches — this is the documented mechanism for Server Action redirects. The `SessionGenerator` component currently renders the result card from returned `data`. After this change, successful generation will navigate away instead.

```typescript
// In generateSessionAction, replace the final return:
import { redirect } from "next/navigation";

// After successful DB insert:
redirect(`/session/${inserted.id}`);
// redirect() throws internally — no return needed after this line
```

The `SessionGenerator` UI state (readiness tap, generate button, error display) remains unchanged. On error paths, the action still returns `{ error: string }` — redirect is only on success.

[ASSUMED] — `redirect()` called in a Server Action invoked via `useTransition` triggers navigation; this is the documented Next.js 16 pattern. The `result?.data` render branch in `SessionGenerator` will become dead code after this change (never reached); safe to leave or clean up.

### Anti-Patterns to Avoid

- **Calling `redirect()` in RSC page before checking auth:** Always read iron-session first; `redirect()` before session check can expose resource existence.
- **Splitting Drizzle `.where()` into chained calls:** IDOR vulnerability — always use single `and(eq(...), eq(...))`. Established project truth-condition.
- **Returning 403 for IDOR violations:** Always `notFound()` → 404. Existence of a resource must never be revealed.
- **Storing computed TSS in the DB:** TSS is a derived value; compute on read. Phase 5 Strava match will add actual TSS from Strava activity data.
- **Calling `xmlEscape` after building attribute values:** Escape before interpolation, not after.
- **Using `Number.toFixed()` without checking for `undefined` powerFraction:** `powerFraction` is guaranteed present on stored blocks (compute-watts.ts dual-path), but type narrowing from `jsonb` column requires explicit cast.
- **Blocking the export Route Handler on a streaming pattern:** XML for a single session (≤20 blocks) fits in memory; `new NextResponse(xml)` is correct; no streaming needed.
- **Generating TSS in the Client Component:** Compute server-side in the RSC and pass as a prop — avoids re-computation on each render and keeps math server-side where the FTP value is authoritative.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zone labels for each block | Custom zone logic | `getZoneForWatts(block.targetWatts, ftp)` from `zones.ts` | Already implemented and tested (zones.test.ts green); Coggan boundaries already encoded |
| IDOR-safe session fetch | Custom DB query | `findTrainingSession(userId, id)` from `queries.ts` | Already implements the `and()` pattern; re-implementing risks introducing a query that silently drops the userId condition |
| Auth in Route Handler | Custom cookie parse | `getIronSession(await cookies(), sessionOptions)` | Established pattern; iron-session handles signing + decryption |
| XML library for .zwo | Third-party XML builder | Inline `xmlEscape()` + template literal | `.zwo` has exactly 5 element types and 2 user-text fields; a full XML library would be 200kB of overhead for ~20 lines of work |
| TSS via npm package | cycling-power-utils or similar | Inline `computeTSS()` in `tss.ts` | The formula is 2 lines; a package adds dependency surface for trivial math |

**Key insight:** This phase has no new algorithmic problems — every hard problem was solved in Phases 1–3. The work is wiring existing utilities into new UI shapes.

## Common Pitfalls

### Pitfall 1: `params` Must Be Awaited in Next.js 16 Route Handlers and Pages

**What goes wrong:** `params.id` returns `undefined`; session lookup fails silently with `findTrainingSession(userId, undefined)` which returns null → `notFound()` on every request.
**Why it happens:** Next.js 16 made `params` a Promise. Destructuring synchronously reads undefined.
**How to avoid:** `const { id } = await params;` — same rule as `cookies()` and `headers()`.
**Warning signs:** Every session route returns 404 including valid IDs.

### Pitfall 2: `jsonb` Column Type Cast for Blocks

**What goes wrong:** TypeScript reports `blocks` as `unknown` from the Drizzle select result; calling `.map()` on it fails at type-check time.
**Why it happens:** Drizzle types `jsonb` columns as `unknown` — it cannot infer the shape at compile time.
**How to avoid:** Cast explicitly: `const blocks = session.blocks as SessionBlock[]`. Add a runtime guard if defensive coding is preferred: `if (!Array.isArray(session.blocks)) notFound()`.
**Warning signs:** TypeScript errors on `session.blocks.map(...)` in the RSC or client component.

### Pitfall 3: `redirect()` Inside Server Action Throws (by Design)

**What goes wrong:** Code after `redirect()` is unreachable; wrapping in try/catch suppresses the redirect.
**Why it happens:** `redirect()` in Next.js throws an internal `NEXT_REDIRECT` error that the framework catches. A try/catch around the DB insert would also catch the redirect, preventing navigation.
**How to avoid:** Call `redirect()` OUTSIDE any try/catch block, as the final statement after the DB insert succeeds. Only catch DB errors inside the try block.
**Warning signs:** `redirect()` is called but the browser doesn't navigate; page stays on dashboard.

### Pitfall 4: XML Escaping Order

**What goes wrong:** XSS in `.zwo` file (low risk since it's a local file) or Zwift XML parse failure if a session title contains `&` or `<`.
**Why it happens:** Title like "5 × 5 < VO2 Max" contains `<` which breaks XML parsing.
**How to avoid:** Run `xmlEscape()` on `session.title` and `session.notes` before interpolating into the template literal. Escape ampersand first (otherwise double-escaping).
**Warning signs:** Zwift refuses to load the `.zwo` file or shows corrupt workout name.

### Pitfall 5: Dashboard "View session" Link When No Session Exists

**What goes wrong:** `findLatestSessionByUserId()` returns `null` for new users; rendering `<a href={`/session/${latestSession.id}`}>` crashes.
**Why it happens:** The dashboard is rendered before Phase 3 generates any session.
**How to avoid:** Conditional render — only show the "View session" link when `latestSession` is not null.
**Warning signs:** TypeError on dashboard for users with no sessions.

### Pitfall 6: powerFraction Precision in .zwo

**What goes wrong:** Zwift rejects blocks with powerFraction values like `0.8999999999999999` due to floating-point representation.
**Why it happens:** JavaScript float arithmetic; stored value is already a float from the DB.
**How to avoid:** Use `b.powerFraction.toFixed(3)` when writing to XML attributes. Three decimal places is sufficient precision (0.001 = ~0.25W at FTP=250).
**Warning signs:** Zwift shows incorrect power targets or rejects the file.

### Pitfall 7: generateSessionAction Redirect + useTransition

**What goes wrong:** If `redirect()` is called inside a Server Action that's invoked via `useTransition`, and the component has an error boundary, the redirect may be caught as an error.
**Why it happens:** Next.js redirect throws; some error boundaries catch it before the framework handles navigation.
**How to avoid:** Ensure no error boundary wraps `SessionGenerator` at a level that would intercept redirect errors. Standard Next.js App Router layout error boundaries (`error.tsx`) handle this correctly.
**Warning signs:** Browser console shows "Error: NEXT_REDIRECT" but navigation doesn't happen.

## Code Examples

Verified patterns from official sources and existing codebase:

### Duration Formatting (existing in SessionGenerator — reuse)

```typescript
// Source: src/components/session/session-generator.tsx (already in codebase)
function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
```

Extract to a shared utility (e.g., `src/lib/training/format.ts`) so both `SessionGenerator` (dashboard) and `SessionDetail` (session page) can import it without duplication.

### Zone Label Display Logic

```typescript
// Client component — getZoneForWatts is pure TS, safe in browser
// Source: src/lib/training/zones.ts (existing)
const zone = getZoneForWatts(block.targetWatts, ftp);
const label = zone
  ? `${zone.label} / ${zone.name}`  // "Z4 / Threshold"
  : block.rpe;                        // "Hard" (no-FTP path)
```

### COPY Keys to Add (Phase 4)

Add to `src/lib/copy.ts` under a `// ── Phase 4: Session detail ──` section:

```typescript
SESSION_PRE_RIDE_EXPORT_BTN: "Export .zwo",
SESSION_PRE_RIDE_START_BTN: "Start session",
SESSION_COMPLETE_HEADING: "Session complete",
SESSION_COMPLETE_BACK: "Back to dashboard",
SESSION_BADGE_TSS: "~{tss} TSS • {duration}",       // substitute at render time
SESSION_BADGE_INTENSITY: "{intensity} • {duration}", // substitute at render time
SESSION_DASHBOARD_VIEW_LINK: "View session",
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `params.id` synchronous | `await params` → `{ id }` | Next.js 15/16 | Must await params in both pages and Route Handlers |
| `cookies()` synchronous | `await cookies()` | Next.js 15/16 | All cookie reads in RSC and Route Handlers must await |
| `redirect()` can be in try/catch | `redirect()` throws; never catch it | Next.js 13.5+ | Place redirect after try/catch, not inside |
| Route Handlers use `Response` | `NextResponse` or `new Response()` both valid | Next.js 13+ | Either works; project uses `NextResponse` pattern |

**Deprecated/outdated:**
- `middleware.ts`: renamed to `proxy.ts` in this project (Next.js 16 convention); do not create `middleware.ts`.
- `export default` in Route Handlers: use named exports (`export async function GET`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `params` in Route Handlers is typed as `Promise<{id: string}>` in Next.js 16 | Pattern 5 | TypeScript error; fix by adjusting type signature |
| A2 | `redirect()` called in a Server Action invoked via `useTransition` triggers browser navigation | Pattern 6 | Navigation fails silently; would need to return redirect URL and use `router.push()` instead |
| A3 | Zwift `.zwo` element attributes are `Duration`, `Power`, `PowerLow`, `PowerHigh` (exact casing) | Pattern 4 | Zwift silently ignores malformed attributes; workout loads with 0W targets |
| A4 | `text-[120px]` is appropriate for the watt numeral on mobile viewport | Pattern 2 | Visual — numeral may overflow or be too small; adjust during implementation |
| A5 | `new NextResponse(xmlString, { headers })` is the correct Route Handler pattern for string body | Pattern 5 | Response not sent correctly; fix by switching to `new Response(xmlString, { headers })` |

## Open Questions (RESOLVED)

1. **Zwift `.zwo` attribute casing**
   - What we know: The format is documented in cycling communities; `SteadyState`, `Warmup`, `Cooldown` element names are widely confirmed.
   - What's unclear: Exact attribute names (`Power` vs `power`, `Duration` vs `duration`) — Zwift's parser may be case-sensitive.
   - **RESOLUTION:** Proceed with community-documented title-case capitalization (`Power`, `Duration`, `PowerLow`, `PowerHigh`), which is consistent across all documented examples and widely used in open-source .zwo generators. If Zwift rejects the file, the executor should try lowercase as a first fallback (5-minute fix). The human-verify checkpoint in Plan 02 includes loading the .zwo in Zwift to confirm. A3 is treated as VERIFIED for planning purposes.

2. **`redirect()` + `useTransition` interaction in Next.js 16**
   - What we know: `redirect()` in Server Actions is documented to throw `NEXT_REDIRECT`. React 18+ catches this in the framework.
   - What's unclear: Whether `useTransition`'s error handling path intercepts the throw before the framework.
   - **RESOLUTION:** Proceed with `redirect()` (Plan 01 Task 3 approach). This is the documented Next.js 16 Server Action pattern. If navigation does not occur during Wave 1 testing, the executor should fall back to returning `{ redirectTo: string }` from the action and calling `router.push(res.redirectTo)` in `SessionGenerator`. The fallback path is concrete and 10-minute scope; no additional plan task is needed. A2 resolved by commitment to this contingency.

## Environment Availability

Step 2.6: SKIPPED — no new external tools, services, or CLIs introduced. All dependencies are existing project code or already-installed npm packages.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (config: `vitest.config.ts`) |
| Config file | `/Users/christianmoore/ai/pace/vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TODAY-01 | Large watt numeral + block counter render correctly | unit | `npx vitest run tests/session-detail.test.ts` | ❌ Wave 0 |
| TODAY-02 | Zone label shown when FTP set; RPE shown when FTP absent | unit | `npx vitest run tests/session-detail.test.ts` | ❌ Wave 0 |
| TODAY-03 | `.zwo` XML output: correct structure, XML-escaped text, powerFraction as decimal | unit | `npx vitest run tests/zwo-export.test.ts` | ❌ Wave 0 |
| TODAY-03 | Export Route Handler: 404 on unknown session, 200 + correct headers on valid session | integration | `npx vitest run tests/export-route.test.ts` | ❌ Wave 0 |
| PROG-01 | `computeTSS()`: correct value for known inputs; null when ftp absent | unit | `npx vitest run tests/tss.test.ts` | ❌ Wave 0 |
| PROG-01 | Intensity label: correct threshold mapping | unit | `npx vitest run tests/tss.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/tss.test.ts tests/zwo-export.test.ts`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/tss.test.ts` — covers PROG-01 (computeTSS math + intensity labels)
- [ ] `tests/zwo-export.test.ts` — covers TODAY-03 (XML structure, XML escaping, block type mapping)
- [ ] `tests/session-detail.test.ts` — covers TODAY-01, TODAY-02 (zone/RPE label logic, block counter; pure logic tests, not DOM)

Route Handler integration tests (`export-route.test.ts`) are complex to set up without a real DB; recommend treating those as manual verification in the phase gate unless MSW is already wired for route handlers.

## Security Domain

`security_enforcement: true` per config.

### Applicable ASVS Categories (ASVS Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — export route must auth-gate | `getIronSession(await cookies(), sessionOptions)` — same as all protected routes |
| V3 Session Management | yes — session cookie read | `iron-session` stateless signed cookie — no changes from established pattern |
| V4 Access Control | yes — IDOR on session + export | `findTrainingSession(userId, id)` with `and()` — established truth-condition; 404 not 403 |
| V5 Input Validation | yes — `[id]` URL parameter | `findTrainingSession` with Drizzle parameterized query; UUID format validated by Postgres `uuid` type |
| V6 Cryptography | no — no new crypto operations | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on `/session/[id]` | Elevation of Privilege | `and(eq(userId), eq(id))` in all DB queries; 404 not 403 |
| IDOR on `/api/session/[id]/export` | Elevation of Privilege | Same guard in Route Handler; re-fetch from DB, never trust URL alone |
| XML injection in `.zwo` output | Tampering | `xmlEscape()` on all user-supplied fields before interpolation |
| Client-supplied `userId` in export | Spoofing | `userId` always read from iron-session server-side; never from query params or request body |
| Unauthenticated export download | Information Disclosure | Route Handler checks session before DB fetch; returns 401 if not authenticated |

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/lib/training/zones.ts`, `src/lib/db/queries.ts`, `src/lib/actions/session.ts`, `src/lib/session.ts`, `src/lib/db/schemas/session.ts`, `src/lib/ai/compute-watts.ts`) — direct read, authoritative
- `CONTEXT.md` Phase 4 — locked decisions from discuss-phase session
- `REQUIREMENTS.md` — TODAY-01–03, PROG-01 requirement text

### Secondary (MEDIUM confidence)
- Next.js 16 async params pattern — established project convention (seen in CLAUDE.md critical constraints)
- iron-session `getIronSession(await cookies(), sessionOptions)` — established pattern used in `session.ts` and all existing Route Handlers

### Tertiary (ASSUMED)
- Zwift `.zwo` XML attribute casing (A3) — training knowledge, not verified against official Zwift documentation this session
- `redirect()` + `useTransition` interaction behavior (A2) — training knowledge

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing utilities confirmed by codebase reads
- Architecture: HIGH — patterns are direct extensions of established Phase 1–3 conventions
- TSS math: HIGH — formula specified verbatim in CONTEXT.md D-10
- `.zwo` format: MEDIUM — element names widely documented but attribute casing not verified against Zwift source
- Pitfalls: HIGH — pitfalls 1–5 are confirmed project patterns; pitfall 7 is documented Next.js behavior

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable stack; no fast-moving dependencies)
