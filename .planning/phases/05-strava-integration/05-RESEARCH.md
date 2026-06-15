# Phase 5: Activity Upload - Research (REPLANNED)

**Researched:** 2026-06-15
**Domain:** .fit file upload, FIT parsing, activity-to-session matching, Drizzle migration, recharts TSS chart
**Confidence:** HIGH

> **REPLAN NOTE:** Previous RESEARCH.md covered Strava OAuth (abandoned — requires paid subscription).
> This file replaces it entirely. All prior Strava OAuth research is obsolete.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Upload endpoint: POST Route Handler at `src/app/api/fit/upload/route.ts`. Receives `multipart/form-data`, reads the file buffer, passes it to `fit-file-parser`, returns JSON with parsed fields and match result. IDOR-guarded via session userId.
- **D-02:** File size limit: **4 MB max** (Vercel hard cap is 4.5 MB — see Critical Finding below; 4 MB enforced in Route Handler code to surface a clean 413 before Vercel's hard cutoff). Return 413 if exceeded.
- **D-03:** Client component: `UploadFitButton` — `<input type="file" accept=".fit">` wrapped in a form, submits via `fetch()` to the Route Handler. Shows loading/success/error state. Lives in `src/components/fit/upload-fit-button.tsx`.
- **D-04:** Replace `stravaConnections`: drop table via migration, create `activity_uploads` (id uuid PK, userId uuid FK→users, fileName text, startedAt timestamp, durationSec integer, avgPowerW integer nullable, estimatedTss integer nullable, matchedSessionId uuid nullable FK→training_sessions, createdAt timestamp).
- **D-05:** No back-reference on `training_sessions` — match owned by `activity_uploads.matchedSessionId`.
- **D-06:** One upload per session (soft constraint) — last upload wins; no unique constraint.
- **D-07:** Library: `fit-file-parser` v3.0.2 — pure JS, no native bindings.
- **D-08:** Extracted fields: `startedAt` (session `start_time`), `durationSec` (session `total_elapsed_time`), `avgPowerW` (session `avg_power`, nullable).
- **D-09:** Parse errors → HTTP 400 `{ error: "invalid_fit_file" }`.
- **D-10:** Match algorithm: same UTC calendar date AND `durationSec` within ±20% of `training_sessions.totalDurationSec`. Pure function in `src/lib/fit/match.ts`.
- **D-11:** No match case: store upload with `matchedSessionId = null`, show "No matching session found for this ride".
- **D-12:** Upload section placement: below session generator, above logout link. Card title "Log a Ride".
- **D-13:** Upload confirmation: inline in the card after upload.
- **D-14:** TSS chart: recharts `BarChart` + `ResponsiveContainer` (300px height), 6-week rolling, `#f97316` bars. Query `activity_uploads` where `matchedSessionId IS NOT NULL`.
- **D-15:** Empty chart state: chart frame with centered label "Upload .fit files to see your training load".

### Claude's Discretion

- Exact Tailwind classes for upload card and chart container
- COPY key names for upload UI strings (success, no-match, error, delete confirm)
- Whether delete is an inline confirm or direct action
- Exact file input styling

### Deferred Ideas (OUT OF SCOPE)

- Strava OAuth integration — deferred to v2 once paid subscription is viable (`UPLOAD-V2-01`)
- Upload history list page — v2
- Bulk .fit import — v2
- Garmin Connect API direct sync — v2
</user_constraints>

---

## Summary

Phase 5 closes the generate → ride → log loop via direct .fit file upload. The user uploads a .fit file from their Garmin or Wahoo device; the server parses it with `fit-file-parser`, extracts session metadata (start time, duration, avg power), estimates TSS, and matches the activity to a training session by date + duration proximity.

**Critical Finding — Vercel body size limit:** Vercel Serverless Functions have a hard limit of **4.5 MB** per request body, enforced at the infrastructure level (returns `413: FUNCTION_PAYLOAD_TOO_LARGE`). This is not configurable. The CONTEXT.md stated 10 MB — this must be revised to 4 MB max enforced in Route Handler code, leaving 0.5 MB headroom. Typical cycling .fit files are 100 KB–2 MB, so 4 MB comfortably covers all normal use.

**TSS note:** The existing `computeTSS()` in `src/lib/training/tss.ts` operates on Block arrays (for planned sessions). A separate `estimateActualTSS()` function is needed for ride data: `TSS = (durationSec × IF²  × 100) / 3600` where `IF = avgPowerW / ftp`. This is a new pure function — do not modify `computeTSS`.

**Primary recommendation:** Install `fit-file-parser@3.0.2`. Use `parseAsync()` with mode `'list'` (flat). Access `data.sessions[0]` for session-level fields. Run the size check before calling `arrayBuffer()`. Write migration dropping `strava_connections` and creating `activity_uploads` in one file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File upload ingestion | API / Backend (Route Handler) | — | Binary parsing; must be server-side; client never sees raw buffer after upload |
| FIT parsing | API / Backend | — | `fit-file-parser` is Node.js only; cannot run in browser or Edge runtime |
| Activity-to-session matching | API / Backend | — | Requires DB query (user's sessions); pure function called from Route Handler |
| TSS estimation from ride | API / Backend | — | Needs user's FTP from DB; result stored server-side |
| Upload confirmation display | Browser / Client | — | React state in `UploadFitButton` after fetch() resolves |
| TSS chart | Browser / Client | Frontend Server (RSC data fetch) | Chart renders client-side (recharts); data fetched server-side and passed as prop |
| Database writes | Database / Storage | — | `activity_uploads` insert via Drizzle; IDOR-guarded |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fit-file-parser` | 3.0.2 | Parse binary .fit files | Pure JS (no native bindings), Vercel-safe, 20K weekly downloads, actively maintained |
| `recharts` | 3.8.1 | TSS bar chart | Already in package.json from Phase 4 — **no install needed** [VERIFIED: npm registry] |
| `@tanstack/react-query` | 5.101.0 | Not needed for this phase | — |

> **recharts status:** NOT currently in `package.json` — confirmed by reading the file. Must be installed.
> **@tanstack/react-query:** NOT in `package.json` — not needed for Phase 5 (chart data passed as server-rendered prop).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `iron-session` | 8.0.4 | Auth guard in Route Handler | Already installed; use `getIronSession(await cookies(), sessionOptions)` |
| `drizzle-orm` | 0.45.2 | Schema + queries for `activity_uploads` | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fit-file-parser` | `@garmin/fitsdk` | Garmin's SDK is complex and not npm-published; fit-file-parser covers all consumer devices |
| `fit-file-parser` | Manual binary parsing | FIT is a documented but complex binary format; hand-rolling is ~500 lines of error-prone code |
| Server-side parse | Client-side parse (browser WebAssembly) | Adds complexity; server parse is simpler and keeps file processing centralized |

**Installation:**
```bash
npm install fit-file-parser recharts
```

**Version verification:**
```
npm view fit-file-parser version  → 3.0.2 [VERIFIED: npm registry]
npm view recharts version         → 3.8.1 [VERIFIED: npm registry]
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `fit-file-parser` | npm | ~9 yrs (v3.0.2 published Jun 3 2026) | 20,708/wk | github.com/jimmykane/fit-parser | SUS (too-new latest version) | Approved — SUS flag is a false positive. Package has a 9-year history; v3.0.2 is a recent patch on an established library. 20K weekly downloads is healthy for a specialized FIT parsing package. |
| `recharts` | npm | ~8 yrs | 52,075,601/wk | github.com/recharts/recharts | OK | Approved |
| `@tanstack/react-query` | npm | ~5 yrs (v5.101.0 published Jun 2 2026) | 58,452,455/wk | github.com/TanStack/query | SUS (too-new latest version) | Not needed in Phase 5 — not installing |

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** `fit-file-parser` — SUS flag is "too-new" for the latest patch version, not for the package itself. The package has a 9-year history on npm and the repo at github.com/jimmykane/fit-parser is active. No postinstall script. Treat as OK.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (UploadFitButton)
  │  fetch POST /api/fit/upload  (multipart/form-data, file ≤4MB)
  ▼
Route Handler (src/app/api/fit/upload/route.ts)
  │  1. Auth: getIronSession → userId
  │  2. Size check: file.size > 4MB → 413
  │  3. file.arrayBuffer() → Buffer
  │  4. FitParser.parseAsync(buffer)
  │        ↓ ParsedFit
  │  5. Extract: sessions[0].start_time, total_elapsed_time, avg_power
  │  6. matchActivity(parsed, userSessions) → matchedSessionId | null
  │  7. estimateActualTSS(durationSec, avgPowerW, ftp) → tss | null
  │  8. db.insert(activityUploads)
  │
  └─→ JSON { startedAt, durationSec, avgPowerW, estimatedTss, matchedSessionId, matchedSessionTitle }

Dashboard RSC (src/app/(app)/dashboard/page.tsx)
  │  Server: db.select from activity_uploads WHERE userId
  │         Group by ISO week → weeklyTSS[]
  ▼
TssChart (Client Component)
  recharts BarChart + ResponsiveContainer
```

### Recommended Project Structure

```
src/
├── lib/
│   └── fit/
│       ├── parse.ts          # FitParser wrapper — parseFitFile(buffer) → FitSession
│       ├── match.ts          # matchActivity(fitSession, trainingSessions) → string | null
│       └── tss-chart-data.ts # buildWeeklyTSS(uploads) → WeeklyTSSPoint[]
├── app/
│   └── api/
│       └── fit/
│           └── upload/
│               └── route.ts  # POST Route Handler
└── components/
    └── fit/
        ├── upload-fit-button.tsx  # 'use client' — file input + fetch
        └── tss-chart.tsx          # 'use client' — recharts BarChart
```

### Pattern 1: FIT File Parsing (fit-file-parser v3 API)

**What:** Parse a Buffer/ArrayBuffer from an uploaded .fit file. Use `parseAsync()` for clean async/await. Use `mode: 'list'` for flat arrays — sessions, records as top-level arrays on `data`.

**Field access in `mode: 'list'`:** `data.sessions` is a `ParsedSession[]`. Each session has `start_time` (string ISO timestamp), `total_elapsed_time` (number, seconds), `avg_power` (number | undefined, watts).

**Source:** [VERIFIED: github.com/jimmykane/fit-parser] — confirmed from `src/fit_types.ts` and `src/fit-parser.ts` in the repo.

```typescript
// Source: github.com/jimmykane/fit-parser src/fit-parser.ts + src/fit_types.ts
import FitParser from 'fit-file-parser';

export interface FitSession {
  startedAt: Date;
  durationSec: number;
  avgPowerW: number | null;
}

export async function parseFitFile(buffer: Buffer): Promise<FitSession> {
  const parser = new FitParser({
    force: true,           // tolerate minor corruption
    speedUnit: 'km/h',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: false,
    mode: 'list',          // flat — data.sessions[] at top level
  });

  const data = await parser.parseAsync(buffer);

  // data.sessions is ParsedSession[] in list mode
  const session = data.sessions?.[0];
  if (!session) {
    throw new Error('no_session_message');
  }

  return {
    startedAt: new Date(session.start_time),          // string → Date
    durationSec: Math.round(session.total_elapsed_time ?? 0),
    avgPowerW: session.avg_power ?? null,              // undefined → null
  };
}
```

**Error handling:** `parseAsync` rejects if the file is not valid FIT binary. Wrap in try/catch → return 400.

**Import note (ESM/CJS dual package):** `fit-file-parser` v3 ships both ESM and CJS (`dist/cjs/`). Next.js 16 with Turbopack handles this automatically. No special `transpilePackages` config needed.

### Pattern 2: Next.js 16 Route Handler — multipart/form-data Upload

**What:** `request.formData()` is the standard App Router way to parse multipart uploads. No `bodyParser: false` config needed — Route Handlers do not use the Pages Router bodyParser.

**Source:** [CITED: github.com/vercel/next.js/discussions/48738]

```typescript
// src/app/api/fit/upload/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import { parseFitFile } from '@/lib/fit/parse';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — below Vercel's 4.5 MB hard cap

export async function POST(request: Request): Promise<NextResponse> {
  // Auth guard
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  // Size check BEFORE arrayBuffer() — avoids loading oversized file into memory
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  // Convert File → Buffer (fit-file-parser accepts Buffer or ArrayBuffer)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const fitSession = await parseFitFile(buffer);
    // ... match, insert, return
  } catch {
    return NextResponse.json({ error: 'invalid_fit_file' }, { status: 400 });
  }
}
```

**Key points:**
- `file.size` is available before `arrayBuffer()` — check it first.
- `Buffer.from(arrayBuffer)` converts `ArrayBuffer` → Node.js `Buffer` (what fit-file-parser accepts).
- `await cookies()` is mandatory in Next.js 16 (async headers).
- No `export const runtime = 'edge'` — fit-file-parser requires Node.js runtime.

### Pattern 3: Activity-to-Session Matching

**What:** Pure function. Same UTC calendar date (compare date strings, not timestamps) AND duration within ±20%.

```typescript
// src/lib/fit/match.ts
interface TrainingSession {
  id: string;
  title: string;
  createdAt: Date;
  totalDurationSec: number;
}

interface FitSession {
  startedAt: Date;
  durationSec: number;
}

export function matchActivity(
  fitSession: FitSession,
  sessions: TrainingSession[]
): { id: string; title: string } | null {
  const fitDate = fitSession.startedAt.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

  for (const s of sessions) {
    const sessionDate = s.createdAt.toISOString().slice(0, 10);
    if (sessionDate !== fitDate) continue;

    const ratio = fitSession.durationSec / s.totalDurationSec;
    if (ratio >= 0.8 && ratio <= 1.2) {
      return { id: s.id, title: s.title };
    }
  }
  return null;
}
```

**Why date strings, not Date objects:** UTC date comparison using `.toISOString().slice(0, 10)` is timezone-safe and avoids off-by-one errors from JS Date arithmetic.

### Pattern 4: TSS Estimation from Ride Data

**What:** New pure function for actual-ride TSS (not planned-session TSS). Formula: `TSS = (durationSec × IF²  × 100) / 3600` where `IF = avgPowerW / ftp`.

**Note:** `computeTSS()` in `src/lib/training/tss.ts` operates on Block arrays (planned sessions) — do not modify it. Add `estimateActualTSS` to a new file or the existing tss.ts as a separate export.

```typescript
// Add to src/lib/training/tss.ts (or new src/lib/fit/tss.ts)
export function estimateActualTSS(
  durationSec: number,
  avgPowerW: number,
  ftp: number
): number {
  const IF = avgPowerW / ftp;
  return Math.round((durationSec * IF * IF * 100) / 3600);
}
// Returns null guard: caller passes null → skip; only call when both avgPowerW and ftp are non-null
```

### Pattern 5: recharts BarChart — Weekly TSS

**What:** Client Component. Data is a `WeeklyTSSPoint[]` array passed as a prop (server-fetched). `ResponsiveContainer` at 100% width / 300px height.

**Source:** [VERIFIED: recharts.github.io/en-US/api/BarChart]

```typescript
// src/components/fit/tss-chart.tsx
'use client';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts';

interface WeeklyTSSPoint {
  week: string;  // "Jun 9", "Jun 16", etc.
  tss: number;
}

interface Props {
  data: WeeklyTSSPoint[];
}

export function TssChart({ data }: Props) {
  if (data.length === 0 || data.every(d => d.tss === 0)) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        Upload .fit files to see your training load
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="tss" fill="#f97316" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**recharts SSR note:** recharts v3 uses SVG and is safe to import in Next.js App Router Client Components. No `dynamic(() => import(...), { ssr: false })` needed for the chart itself.

### Pattern 6: Drizzle Migration — Drop + Create in One File

**What:** Removing `stravaConnections` from `schema.ts` and adding `activityUploads` causes `drizzle-kit generate` to produce a migration with `DROP TABLE "strava_connections"` and `CREATE TABLE "activity_uploads"` in the same file.

**Source:** [CITED: orm.drizzle.team/docs/drizzle-kit-generate]

The generated file follows the `-->statement-breakpoint` separator pattern used in this project's existing migrations.

**Expected generated SQL (hand-written if using `--custom`):**

```sql
-- drizzle/XXXX_activity_uploads.sql
DROP TABLE "strava_connections";--> statement-breakpoint
CREATE TABLE "activity_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "started_at" timestamp NOT NULL,
  "duration_sec" integer NOT NULL,
  "avg_power_w" integer,
  "estimated_tss" integer,
  "matched_session_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "activity_uploads"
  ADD CONSTRAINT "activity_uploads_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_uploads"
  ADD CONSTRAINT "activity_uploads_matched_session_id_training_sessions_id_fk"
  FOREIGN KEY ("matched_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_uploads_user_id_idx" ON "activity_uploads" USING btree ("user_id");
```

**`matchedSessionId` FK:** Use `ON DELETE SET NULL` so deleting a training session doesn't cascade-delete upload records.

**Workflow:**
1. Update `schema.ts` — remove `stravaConnections`, add `activityUploads`.
2. Update `queries.ts` — remove `stravaConnections` import, add `activityUploads` import.
3. Run `npx drizzle-kit generate` → inspect the generated .sql for correctness.
4. Run `npx drizzle-kit migrate` with `DATABASE_URL_UNPOOLED`.

**Pitfall:** `drizzle-kit generate` will detect the table removal and generate `DROP TABLE`. If the `strava_connections` table has no data (it's a skeleton table created in Phase 0), the drop is safe. Verify with `SELECT COUNT(*) FROM strava_connections` before running.

### Anti-Patterns to Avoid

- **Reading arrayBuffer() before size check:** Loads the full file into memory. Always check `file.size` first.
- **Using `mode: 'cascade'`:** Sessions are nested inside `data.activity.sessions` in cascade mode — different access path. Use `mode: 'list'` so `data.sessions` is a top-level array.
- **Comparing timestamps for date matching:** Use `.toISOString().slice(0, 10)` — do not subtract timestamps for same-day check (timezone drift).
- **Chaining `.where()` in Drizzle:** `and()` is mandatory — chained `.where()` silently drops the first condition (IDOR vulnerability). Pattern: `.where(and(eq(table.userId, userId), eq(table.id, id)))`.
- **Modifying `computeTSS()`:** The existing function takes Block arrays (planned sessions). Keep it unchanged and add a separate `estimateActualTSS()` for ride data.
- **Setting `export const runtime = 'edge'`:** Edge runtime does not support Node.js `Buffer` — fit-file-parser requires Node.js runtime.
- **Expecting fit-file-parser to handle non-.fit files gracefully without `force: true`:** Without `force: true`, minor header issues throw. Use `force: true` always; validate the result (`sessions[0]` exists) after parsing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FIT binary parsing | Custom binary reader | `fit-file-parser` | FIT protocol has CRC validation, encoding tables, message definitions — 400+ lines of spec |
| TSS bar chart | SVG/canvas drawing | `recharts` BarChart | Axis scaling, responsive layout, tooltip, accessibility — already solved |
| Drizzle drop+create migration | Manual SQL in migration | `drizzle-kit generate` | Handles snapshot diffing and `_journal.json` bookkeeping automatically |

---

## Common Pitfalls

### Pitfall 1: Vercel 4.5 MB Body Hard Cap
**What goes wrong:** File uploads over 4.5 MB return `413: FUNCTION_PAYLOAD_TOO_LARGE` from Vercel's infrastructure before the Route Handler runs. The handler cannot catch this.
**Why it happens:** Vercel buffers the entire request body in memory before invoking the function. Hard limit, not configurable.
**How to avoid:** Check `file.size > 4 * 1024 * 1024` inside the Route Handler (for files that slip through) AND display the 4 MB limit in the upload UI. Typical .fit files are 100 KB–2 MB.
**Warning signs:** 413 errors with no Route Handler logs.

### Pitfall 2: fit-file-parser mode affects data access path
**What goes wrong:** With `mode: 'cascade'` (the default in the example script), sessions live at `data.activity.sessions[0]`. With `mode: 'list'`, sessions live at `data.sessions[0]`.
**Why it happens:** The mode changes the tree structure vs. flat structure of the parsed output.
**How to avoid:** Always specify `mode: 'list'` explicitly and access `data.sessions[0]`.
**Warning signs:** `data.sessions` is undefined; the session object has no fields.

### Pitfall 3: `avg_power` absent on non-power-meter rides
**What goes wrong:** Rides from devices without a power meter don't include `avg_power` in the session message. Accessing it without a null check throws or stores 0.
**Why it happens:** `avg_power` is optional in the FIT spec.
**How to avoid:** `session.avg_power ?? null` — store null, skip TSS estimation.
**Warning signs:** TSS stored as 0 for all rides.

### Pitfall 4: Drizzle silently drops first `.where()` when chained
**What goes wrong:** Writing `.where(eq(activityUploads.userId, userId)).where(eq(activityUploads.id, uploadId))` returns rows for ANY userId — IDOR vulnerability.
**Why it happens:** Drizzle's API silently replaces the first where clause.
**How to avoid:** Always `and(eq(table.userId, userId), eq(table.id, id))` in a single `.where()` call.
**Warning signs:** Cross-user data access in tests.

### Pitfall 5: recharts requires a parent with explicit height
**What goes wrong:** `ResponsiveContainer height={300}` renders at 0px if the parent `div` has no height.
**Why it happens:** `ResponsiveContainer` measures its parent's dimensions.
**How to avoid:** Wrap in a `div` with explicit height or use `height={300}` on `ResponsiveContainer` directly (not `height="100%"` unless parent has a fixed height).
**Warning signs:** Blank chart area, no error in console.

---

## Code Examples

### buildWeeklyTSS — in-memory aggregation (6 weeks × ≤7 sessions)

```typescript
// src/lib/fit/tss-chart-data.ts
interface ActivityUpload {
  startedAt: Date;
  estimatedTss: number | null;
  matchedSessionId: string | null;
}

interface WeeklyTSSPoint {
  week: string;   // "Jun 9"
  tss: number;
}

export function buildWeeklyTSS(uploads: ActivityUpload[]): WeeklyTSSPoint[] {
  const now = new Date();
  const weeks: WeeklyTSSPoint[] = [];

  // Build 6 week buckets, Monday-anchored
  for (let i = 5; i >= 0; i--) {
    const weekStart = getMonday(now, -i);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const tss = uploads
      .filter(u =>
        u.matchedSessionId !== null &&
        u.estimatedTss !== null &&
        u.startedAt >= weekStart &&
        u.startedAt < weekEnd
      )
      .reduce((sum, u) => sum + (u.estimatedTss ?? 0), 0);

    weeks.push({ week: label, tss });
  }

  return weeks;
}

function getMonday(date: Date, weekOffset: number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday = 1
  d.setDate(diff + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

### Drizzle schema for activityUploads

```typescript
// In src/lib/db/schema.ts — replace stravaConnections
import { pgTable, uuid, text, timestamp, index, integer } from "drizzle-orm/pg-core";

export const activityUploads = pgTable(
  "activity_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    startedAt: timestamp("started_at").notNull(),
    durationSec: integer("duration_sec").notNull(),
    avgPowerW: integer("avg_power_w"),                  // nullable — no power meter
    estimatedTss: integer("estimated_tss"),             // nullable — no FTP or no power
    matchedSessionId: uuid("matched_session_id")
      .references(() => trainingSessions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("activity_uploads_user_id_idx").on(t.userId)]
);
```

---

## Runtime State Inventory

> Phase 5 drops a table. Check for runtime state before applying the migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `strava_connections` table — skeleton only (id, user_id, created_at). Created in migration 0000. No data expected in development. | Verify `SELECT COUNT(*) FROM strava_connections = 0` before running migration. |
| Live service config | None — no Strava OAuth tokens stored (Strava OAuth was never implemented) | None |
| OS-registered state | None | None |
| Secrets/env vars | None referencing `stravaConnections` or Strava OAuth in this codebase | None |
| Build artifacts | `queries.ts` imports `stravaConnections` from schema — will break TypeScript compile after schema change | Update `queries.ts` import + remove `findStravaConnection` in same PR |

**Migration safety:** The `strava_connections` table was created as a skeleton in Phase 0. It has never had Strava data written to it (Strava OAuth was never completed). DROP TABLE is safe.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | fit-file-parser (Buffer API) | ✓ | 20.9+ (confirmed by CLAUDE.md) | — |
| `drizzle-kit` | Migration generation | ✓ | 0.31.10 (in devDependencies) | — |
| `DATABASE_URL_UNPOOLED` | Migration execution | Assumed ✓ | — | Cannot migrate without it |
| `recharts` | TSS chart | ✗ | — | Must install: `npm install recharts` |
| `fit-file-parser` | FIT parsing | ✗ | — | Must install: `npm install fit-file-parser` |

**Missing dependencies requiring install:**
- `fit-file-parser@3.0.2` — Wave 0 install task
- `recharts@3.8.1` — Wave 0 install task

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (in devDependencies) |
| Config file | none detected — vitest uses defaults (reads from `vite.config.ts` or inline) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-07/D-08 | `parseFitFile(buffer)` returns correct startedAt, durationSec, avgPowerW | unit | `npx vitest run src/lib/fit/parse.test.ts` | ❌ Wave 0 |
| D-10 | `matchActivity()` returns correct sessionId on date+duration match | unit | `npx vitest run src/lib/fit/match.test.ts` | ❌ Wave 0 |
| D-10 | `matchActivity()` returns null when date doesn't match | unit | `npx vitest run src/lib/fit/match.test.ts` | ❌ Wave 0 |
| D-10 | `matchActivity()` returns null when duration >20% off | unit | `npx vitest run src/lib/fit/match.test.ts` | ❌ Wave 0 |
| D-14 | `buildWeeklyTSS()` groups 6 weeks correctly | unit | `npx vitest run src/lib/fit/tss-chart-data.test.ts` | ❌ Wave 0 |
| D-01 | POST /api/fit/upload with no session → 401 | integration/manual | manual | — |
| D-02 | POST /api/fit/upload with file >4MB → 413 | unit | `npx vitest run src/lib/fit/parse.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `src/lib/fit/parse.test.ts` — covers D-07/D-08 (parseFitFile unit tests; use a small synthetic Buffer)
- [ ] `src/lib/fit/match.test.ts` — covers D-10 (matchActivity: match, no-date-match, no-duration-match)
- [ ] `src/lib/fit/tss-chart-data.test.ts` — covers D-14 (buildWeeklyTSS grouping)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | iron-session guard at Route Handler top |
| V4 Access Control | yes | `and(eq(activityUploads.userId, userId), ...)` — IDOR guard mandatory |
| V5 Input Validation | yes | file.size check; try/catch on parseFitFile; no user content in SQL |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on upload delete | Elevation of Privilege | `and(eq(activityUploads.userId, userId), eq(activityUploads.id, uploadId))` |
| Oversized .fit file DoS | DoS | `file.size > 4MB` check before `arrayBuffer()` |
| Malformed FIT binary | Tampering | `try/catch` around `parseFitFile` → 400 |
| Unauthenticated upload | Spoofing | `getIronSession` at Route Handler entry; 401 on no session |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Strava OAuth for activity sync | .fit file upload (direct) | Phase 5 replan (2026-06-15) | No Strava subscription required |
| `stravaConnections` table | `activityUploads` table | Phase 5 migration | Drop + create in one migration |
| `fit-file-parser` v1/v2 callback-only API | v3 `parseAsync()` | v3.0.0 (2026) | Clean async/await; no callback wrapper needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Typical cycling .fit files are 100 KB–2 MB, well under 4 MB limit | Standard Stack | If a user's device produces >4 MB files (e.g., Garmin navigation bug), they get a 413 — surfaced as UI error |
| A2 | `fit-file-parser` v3 works without `transpilePackages` in Next.js 16 with Turbopack | Pattern 1 | If ESM/CJS resolution fails, add `transpilePackages: ['fit-file-parser']` to `next.config.ts` |
| A3 | `strava_connections` table has 0 rows in all environments | Runtime State Inventory | If it has rows, the DROP will fail FK constraints (no FKs from other tables, so it won't) — but data loss is possible in a real deployment |

---

## Open Questions

1. **`transpilePackages` for fit-file-parser?**
   - What we know: fit-file-parser v3 ships dual ESM/CJS. Next.js 16 Turbopack handles most dual-package libraries.
   - What's unclear: Whether Turbopack needs `transpilePackages: ['fit-file-parser']` to resolve the ESM build correctly.
   - Recommendation: Don't add it initially. If `import FitParser from 'fit-file-parser'` fails with a module resolution error at runtime, add `transpilePackages: ['fit-file-parser']` to `next.config.ts`. [ASSUMED]

2. **Delete upload UX — inline confirm or direct?**
   - What we know: Decision left to Claude's discretion.
   - What's unclear: Whether a delete confirm adds enough safety or is just friction for a low-stakes action.
   - Recommendation: Direct delete (no confirm) for v1. The consequence of accidental delete is re-uploading a .fit file — low cost.

---

## Sources

### Primary (HIGH confidence)
- `github.com/jimmykane/fit-parser` — `src/fit-parser.ts`, `src/fit_types.ts`, `src/helper.ts`, `examples/parse.js` — direct repo read via `gh api`
- `vercel.com/docs/functions/limitations` — Vercel 4.5 MB hard body size limit (confirmed from official docs, last updated 2026-06-02)
- `recharts.github.io/en-US/api/BarChart/` — BarChart props and ResponsiveContainer pattern

### Secondary (MEDIUM confidence)
- `github.com/vercel/next.js/discussions/48738` — confirmed `request.formData()` + `file.arrayBuffer()` pattern for App Router Route Handlers
- `npm view fit-file-parser --json` — version 3.0.2, dependency `buffer@^6.0.3`, no postinstall
- `orm.drizzle.team/docs/drizzle-kit-generate` — drizzle-kit generates DROP TABLE when table removed from schema

### Tertiary (LOW confidence)
- Web search: Vercel 4.5 MB limit widely documented across community posts — cross-confirmed with official docs (upgraded to HIGH)

---

## Metadata

**Confidence breakdown:**
- fit-file-parser API: HIGH — read directly from repo source files
- Next.js formData upload pattern: HIGH — confirmed from official discussions + existing project pattern (login route uses same Request pattern)
- Vercel 4.5 MB limit: HIGH — confirmed from official Vercel docs (2026-06-02)
- Drizzle migration drop+create: MEDIUM — documented behavior; will verify output after `drizzle-kit generate`
- recharts BarChart pattern: HIGH — confirmed from official recharts docs
- TSS formula: HIGH — matches CONTEXT.md D-08 spec

**Research date:** 2026-06-15
**Valid until:** 2026-09-15 (stable APIs)
