# Phase 4: Today View & Export - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/(app)/session/[id]/page.tsx` | page (RSC) | request-response | `src/app/(app)/dashboard/page.tsx` | exact |
| `src/components/session/session-detail.tsx` | component (client) | event-driven | `src/components/session/session-generator.tsx` | exact |
| `src/app/api/session/[id]/export/route.ts` | route handler | request-response | `src/app/api/auth/login/route.ts` | role-match |
| `src/lib/training/tss.ts` | utility | transform | `src/lib/training/zones.ts` | role-match |
| `src/lib/actions/session.ts` (modify) | server action | request-response | self | exact |
| `src/app/(app)/dashboard/page.tsx` (modify) | page (RSC) | request-response | self | exact |
| `src/lib/copy.ts` (modify) | config | — | self | exact |
| `src/lib/training/format.ts` (new, discretionary) | utility | transform | `src/components/session/session-generator.tsx` lines 59–67 | role-match |

---

## Pattern Assignments

### `src/app/(app)/session/[id]/page.tsx` (RSC page, request-response)

**Analog:** `src/app/(app)/dashboard/page.tsx`

**Imports pattern** (lines 17–23):
```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findUserProfileByUserId } from "@/lib/db/queries";
import { COPY } from "@/lib/copy";
```

**Auth pattern** (lines 27–34):
```typescript
// Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints).
const session = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);

if (!session.id) {
  redirect("/login");
}
```

**Async params pattern** (Next.js 16 — `params` is a Promise):
```typescript
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

**IDOR guard + notFound pattern** — from `src/lib/db/queries.ts` lines 30–45:
```typescript
// IDOR guard: and() is mandatory — do not split into chained .where() calls.
const rows = await db
  .select()
  .from(trainingSessions)
  .where(
    and(
      eq(trainingSessions.userId, userId),
      eq(trainingSessions.id, sessionId)
    )
  );
// Caller calls notFound() on null — 404 not 403
return rows[0] ?? null;
```

**404 on no-match** (Next.js `notFound()`):
```typescript
import { notFound } from "next/navigation";
const trainingSession = await findTrainingSession(ironSession.id, id);
if (!trainingSession) notFound(); // 404, never 403 — IDOR policy
```

**Profile + derived data fetch** (dashboard pattern lines 37–42):
```typescript
const profile = await findUserProfileByUserId(session.id);
const ftpStatus = profile?.ftp
  ? COPY.DASHBOARD_FTP_ACTIVE.replace("{value}", String(profile.ftp))
  : COPY.DASHBOARD_FTP_ABSENT;
```

---

### `src/components/session/session-detail.tsx` (client component, event-driven)

**Analog:** `src/components/session/session-generator.tsx`

**Client directive + imports pattern** (lines 1–33):
```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
```

**useState sub-state machine pattern** (lines 79–91):
```typescript
const [isPending, startTransition] = useTransition();
const [readiness, setReadiness] = useState<number | null>(null);
const [result, setResult] = useState<ActionResult | null>(null);
```
Apply as:
```typescript
type SubState = "pre-ride" | "riding" | "complete";

export function SessionDetail({ session, ftp, tss }: SessionDetailProps) {
  const [subState, setSubState] = useState<SubState>("pre-ride");
  const [blockIndex, setBlockIndex] = useState(0);
  // ...
}
```

**Conditional render by state pattern** (lines 141–168):
```typescript
{sessionData && (
  <Card>
    <CardHeader><CardTitle>{sessionData.title}</CardTitle></CardHeader>
    <CardContent>...</CardContent>
  </Card>
)}
{result?.error && <ErrorBanner message={result.error} />}
```

**Block list / data display pattern** (lines 148–164):
```typescript
<dl className="space-y-1 text-sm text-muted-foreground">
  <div className="flex items-center gap-2">
    <dt className="font-medium text-foreground">Duration</dt>
    <dd>{formatDuration(sessionData.totalDurationSec)}</dd>
  </div>
</dl>
```

**jsonb cast pattern** (lines 156–158 — Drizzle types jsonb as `unknown`):
```typescript
Array.isArray(sessionData.blocks)
  ? (sessionData.blocks as GeneratedSession["blocks"]).length
  : 0
```
Apply as: `const blocks = session.blocks as SessionBlock[];`

**Zone label usage** — from `src/lib/training/zones.ts`:
```typescript
import { getZoneForWatts } from "@/lib/training/zones";
const zone = getZoneForWatts(block.targetWatts, ftp);
const label = zone
  ? `${zone.label} / ${zone.name}`  // "Z4 / Threshold"
  : block.rpe;                       // "Hard" (no-FTP path)
```

---

### `src/app/api/session/[id]/export/route.ts` (route handler, request-response)

**Analog:** `src/app/api/auth/login/route.ts`

**Imports pattern** (lines 20–30):
```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
```

**Named export + async params pattern** (lines 38 + Next.js 16 requirement):
```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

**Auth guard in route handler** (lines 106–114):
```typescript
const session = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);
// For export: return 401 JSON (not redirect — this is a data endpoint)
if (!session.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**IDOR guard** (same pattern as login `db.select().where()` scoped query):
```typescript
const trainingSession = await findTrainingSession(session.id, id);
if (!trainingSession) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

**Response with custom headers** (login route `NextResponse.json` pattern — adapt for file):
```typescript
return new NextResponse(xml, {
  status: 200,
  headers: {
    "Content-Type": "application/xml",
    "Content-Disposition": `attachment; filename="${safeName}.zwo"`,
  },
});
```

**Error return pattern** (line 56–57 of login route):
```typescript
return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
```

---

### `src/lib/training/tss.ts` (utility, transform)

**Analog:** `src/lib/training/zones.ts`

**Module header pattern** (lines 1–13):
```typescript
/**
 * [Utility description] — pure TypeScript, zero dependencies.
 *
 * Returns null when FTP is absent (PROF-03 RPE fallback path).
 * Callers check for null and render RPE descriptions instead of zone labels.
 *
 * Used by:
 *   - Phase 4: session page (server-side TSS computation, passed as prop)
 */
```

**Pure function + null-when-no-FTP pattern** (lines 41–48):
```typescript
export function computeZones(ftp: number | null | undefined): PowerZone[] | null {
  if (!ftp) return null;
  // ...computation...
}
```
Apply as:
```typescript
export function computeTSS(
  blocks: Block[],
  ftp: number | null
): number | null {
  if (!ftp) return null;
  // ...TSS formula from CONTEXT.md D-10...
}
```

**Type definition pattern** (lines 15–23 of zones.ts):
```typescript
export type PowerZone = {
  zone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  // ...
};
```
Apply as:
```typescript
type Block = { durationSec: number; powerFraction: number };
```

---

### `src/lib/actions/session.ts` — redirect update (modify existing)

**Analog:** self (current file)

**redirect after DB insert — placement rule** (RESEARCH Pitfall 3):
```typescript
// CORRECT: redirect() OUTSIDE the try/catch; never inside
import { redirect } from "next/navigation";

// After the DB insert try/catch succeeds:
if (!inserted) {
  return { error: "Failed to save session. Please try again." };
}

// redirect() throws NEXT_REDIRECT — must be outside any try/catch
redirect(`/session/${inserted.id}`);
```

Current return at line 187: `return { data: inserted }` — replace with `redirect(...)` after importing `redirect` from `"next/navigation"`.

---

### `src/app/(app)/dashboard/page.tsx` — "View session" link (modify existing)

**Analog:** self (current file, lines 63–69)

**Existing link pattern** (lines 63–69):
```typescript
<a
  href="/profile"
  className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  {COPY.DASHBOARD_LINK_EDIT_PROFILE}
</a>
```

**Conditional render guard** (Pitfall 5 — null when no session):
```typescript
{latestSession && (
  <a
    href={`/session/${latestSession.id}`}
    className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {COPY.SESSION_DASHBOARD_VIEW_LINK}
  </a>
)}
```

Requires adding `findLatestSessionByUserId` to the imports in `dashboard/page.tsx` and calling it server-side alongside `findUserProfileByUserId`.

---

### `src/lib/copy.ts` — Phase 4 copy additions (modify existing)

**Analog:** self (current file)

**Section pattern** (lines 44–46 — existing section header convention):
```typescript
// ── Phase 4: Session detail ──────────────────────────────────────────────────

SESSION_PRE_RIDE_EXPORT_BTN: "Export .zwo",
SESSION_PRE_RIDE_START_BTN: "Start session",
SESSION_COMPLETE_HEADING: "Session complete",
SESSION_COMPLETE_BACK: "Back to dashboard",
SESSION_DASHBOARD_VIEW_LINK: "View session",
```

Badge strings with substitution tokens (match existing DASHBOARD_FTP_ACTIVE pattern at line 69):
```typescript
SESSION_BADGE_TSS: "~{tss} TSS · {duration}",      // substitute at render time
SESSION_BADGE_INTENSITY: "{intensity} · {duration}", // substitute at render time
```

---

### `src/lib/training/format.ts` (new utility, transform)

**Analog:** `src/components/session/session-generator.tsx` lines 59–67

**Extract this function** (session-generator.tsx lines 59–67):
```typescript
/** Format total duration in seconds to human-readable "X min" or "Xh Ym". */
function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
```

Export from `src/lib/training/format.ts`. Import in both `session-generator.tsx` (replace local copy) and `session-detail.tsx`.

---

## Shared Patterns

### Auth in RSC Pages
**Source:** `src/app/(app)/dashboard/page.tsx` lines 27–34
**Apply to:** `src/app/(app)/session/[id]/page.tsx`
```typescript
const session = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);
if (!session.id) {
  redirect("/login");
}
```

### Auth in Route Handlers (returns JSON, not redirect)
**Source:** `src/app/api/auth/login/route.ts` lines 106–114
**Apply to:** `src/app/api/session/[id]/export/route.ts`
```typescript
const ironSession = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);
if (!ironSession.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### IDOR Guard (and() is mandatory)
**Source:** `src/lib/db/queries.ts` lines 34–44
**Apply to:** export route handler (re-fetches session server-side with same guard)
```typescript
.where(
  and(
    eq(trainingSessions.userId, userId),
    eq(trainingSessions.id, sessionId)
  )
)
// notFound() or { status: 404 } on null; NEVER 403
```

### Async Params (Next.js 16)
**Source:** CLAUDE.md §Critical Version Constraints + RESEARCH.md Pitfall 1
**Apply to:** `src/app/(app)/session/[id]/page.tsx`, `src/app/api/session/[id]/export/route.ts`
```typescript
// params is a Promise in Next.js 16 — must await
const { id } = await params;
// cookies() is also async
await cookies()
```

### COPY pattern (all user-visible strings)
**Source:** `src/lib/copy.ts` + `src/app/(app)/dashboard/page.tsx` line 23, 42, 58
**Apply to:** `session-detail.tsx`, `dashboard/page.tsx` modifications
```typescript
import { COPY } from "@/lib/copy";
// Use COPY.KEY_NAME — never inline strings for user-visible text
```

### Error display
**Source:** `src/components/session/session-generator.tsx` line 168
**Apply to:** `session-detail.tsx` (any error state)
```typescript
import { ErrorBanner } from "@/components/ui/error-banner";
{errorMessage && <ErrorBanner message={errorMessage} />}
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/app/`, `src/components/`, `src/lib/`
**Files scanned:** 12 source files read directly
**Pattern extraction date:** 2026-06-15
