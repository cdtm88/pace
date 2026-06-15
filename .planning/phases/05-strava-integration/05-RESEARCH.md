# Phase 5: Strava Integration - Research

**Researched:** 2026-06-15
**Domain:** Strava OAuth2, AES-GCM encryption, activity matching, Recharts TSS chart
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** OAuth CSRF state stored in iron-session under `pending_strava_state` key; deleted immediately after callback validation (prevent replay).
- **D-02:** Scope mismatch (missing `activity:read`) → redirect to `/dashboard?strava_error=scope_denied` → existing `ErrorBanner`.
- **D-03:** "Connect with Strava" button on dashboard below session generator in its own card; connected state shows "Connected as {athleteName}" + disconnect button.
- **D-04:** `stravaConnections` adds: `stravaAthleteId` (bigint), `accessToken` (text, AES-encrypted), `refreshToken` (text, AES-encrypted), `expiresAt` (integer Unix epoch seconds), `scope` (text), `athleteName` (text).
- **D-05:** `TOKEN_ENC_KEY` as 32-byte base64 in env; AES-GCM via Web Crypto API (`crypto.subtle`) — no external packages.
- **D-06:** IV prefixed to ciphertext in same column: `base64(iv + ciphertext)`. First 16 bytes = IV, remainder = ciphertext.
- **D-07:** Proactive refresh at `expiresAt - 600`; on 401 from Strava treat as disconnected — prompt reconnect.
- **D-08:** Match criteria: same UTC calendar date AND duration within ±20% of `totalDurationSec`; fetch last 30 activities.
- **D-09:** Add `stravaActivityId` (bigint, nullable) to `training_sessions` via new migration.
- **D-10:** Match trigger: on initial connect + manual Refresh button. NOT on every page load.
- **D-11:** No "unmatched" indicator in UI — sessions show Strava badge only when matched.
- **D-12:** Dashboard Strava card: connected state has Refresh + Disconnect; disconnected state has official SVG button.
- **D-13:** TSS chart: Recharts `BarChart` + `ResponsiveContainer` (300px height), 6-week rolling, one bar per week, orange-500 fill.
- **D-14:** HTTP 429 → exponential backoff (3 retries: 1s, 2s, 4s) → `ErrorBanner` + "Tap to retry" button.
- **D-15:** Empty chart state: chart frame renders with centered text label — never hidden.

### Claude's Discretion

- Exact Tailwind classes for the Strava connection card and TSS chart container.
- COPY key names in `src/lib/copy.ts` for new user-visible strings.
- Bar color for TSS chart (suggest `#f97316` orange-500).
- Weekly TSS computed in-memory (6 weeks × ≤7 sessions is tiny — in-memory is fine).
- Whether "Refresh" button triggers a Server Action or Route Handler POST.

### Deferred Ideas (OUT OF SCOPE)

- Strava webhooks (real-time push on new activity) — v2.
- `STRAVA-V2-01`: webhook subscription replaces polling.
- Avatar/profile photo from Strava (`athlete.profile` URL).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRAVA-01 | User connects Strava via OAuth2 with official button; callback verifies CSRF state and confirms `activity:read` scope | OAuth flow, state param, scope check, callback route |
| STRAVA-02 | User disconnects Strava; tokens deleted from DB | Server Action disconnect + DELETE query |
| STRAVA-03 | After connect or manual refresh, last 30 activities fetched and auto-matched to sessions by date/duration | Strava activities endpoint, match algorithm |
| STRAVA-04 | Token refresh before expiry; 429 handled with exponential backoff + user-visible retry state | Proactive refresh logic, retry helper |
| STRAVA-05 | Tokens encrypted at rest via AES-GCM; never written to DB in plaintext | Web Crypto API encrypt/decrypt pattern |
| PROG-02 | Weekly TSS bar chart (recharts, 6-week rolling) showing training load | Recharts BarChart, computeTSS from existing tss.ts |
</phase_requirements>

---

## Summary

Phase 5 closes the generate → ride → log loop by connecting Strava OAuth, encrypting tokens at rest, auto-matching activities to sessions, and rendering a 6-week TSS chart. All decisions are locked — the research validates implementation patterns for the specific choices made.

The dominant complexity is the OAuth callback Route Handler, which must (in order): validate the CSRF state, confirm scope, exchange the code for tokens, encrypt both tokens before writing, persist the connection, immediately trigger the activity match, then redirect. Any failure in this sequence must leave the DB in a clean state — no partial writes.

The secondary complexity is the AES-GCM crypto utility. Web Crypto's `crypto.subtle` is available natively in Next.js 16's runtime (both Node.js 20+ and the Edge runtime). The IV-prefixed column format (D-06) requires careful byte-level handling: `TextEncoder` for plaintext, `Uint8Array` concatenation for IV+ciphertext, `btoa` for base64 — all synchronous wrappers are async in Web Crypto.

**Primary recommendation:** Build in wave order — crypto utility first (no dependencies), then Drizzle migration, then Strava client + match logic, then the OAuth callback route, then Server Actions, then UI components (strava-section + tss-chart), then dashboard wiring.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth initiation (redirect to Strava) | API / Backend (Server Action) | — | Session write (`pending_strava_state`) requires server; no client secrets |
| OAuth callback + token exchange | API / Backend (Route Handler) | — | Receives auth code from Strava; must be a GET Route Handler, not a Server Action |
| Token encryption/decryption | API / Backend (lib utility) | — | Secrets never touch client bundle |
| Token storage + refresh | Database / Storage | API / Backend | Encrypted blobs in Neon; refresh logic in server lib |
| Activity fetch + match | API / Backend (Server Action) | Database / Storage | Strava API call + DB read/write; triggered by user action |
| TSS chart data aggregation | API / Backend (RSC) | — | Computed server-side from `training_sessions`; passed as prop to chart component |
| TSS chart rendering | Browser / Client | — | Recharts requires DOM; `tss-chart.tsx` must be a Client Component (`"use client"`) |
| Strava section UI state | Browser / Client | — | Connected/disconnected/confirming states managed with `useState` in `strava-section.tsx` |
| 429 retry state | Browser / Client | API / Backend | Error state held client-side; retry re-invokes Server Action |

---

## Standard Stack

### Core (one new package — recharts)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | 3.8.1 | TSS BarChart | **NOT YET INSTALLED** — absent from package.json at research time; installed in 05-03 Wave 3 Task 1 after a human legitimacy checkpoint. `ResponsiveContainer` handles mobile widths. |
| `iron-session` | 8.0.4 | OAuth CSRF state via `pending_strava_state` | Already installed; reuses existing session infrastructure |
| `drizzle-orm` / `drizzle-kit` | 0.45.2 / 0.31.10 | Schema migration, token column additions | Already installed; two migrations needed |
| `@neondatabase/serverless` | 1.1.0 | DB writes for token storage, match updates | Already installed |
| Web Crypto API (`crypto.subtle`) | Node.js built-in (20+) | AES-GCM encrypt/decrypt | No package needed; available in Next.js 16 server runtime |

**One new install required:** `recharts@3.8.1` — installed by 05-03 after a blocking human legitimacy checkpoint (npmjs.com/package/recharts verified before install).

### Installation
```bash
# Performed in 05-03 Wave 3 Task 1 (after human legitimacy checkpoint):
npm install recharts@3.8.1
```

---

## Package Legitimacy Audit

One new package introduced in this phase. Remaining deps (iron-session, drizzle-orm, @neondatabase/serverless) were audited in prior phases.

| Package | Status | Notes |
|---------|--------|-------|
| recharts | [ASSUMED — legitimacy checkpoint in 05-03] | Not yet in package.json; human verifies npmjs.com/package/recharts before install |
| iron-session | Already installed and audited | Prior phase |
| drizzle-orm / drizzle-kit | Already installed and audited | Prior phase |
| @neondatabase/serverless | Already installed and audited | Prior phase |

---

## Architecture Patterns

### System Architecture Diagram

```
User browser
  │
  ├─[tap Connect]──► Server Action: connectStravaAction
  │                    │
  │                    ├─ store crypto.randomUUID() → session.pending_strava_state
  │                    └─ redirect() → https://www.strava.com/oauth/authorize?...
  │
  ◄──────────────── Strava OAuth page
  │
  ├─[callback]─────► GET /api/strava/callback?code=&state=
  │                    │
  │                    ├─ validate state === session.pending_strava_state (CSRF)
  │                    ├─ delete session.pending_strava_state
  │                    ├─ confirm "activity:read" in scope
  │                    ├─ POST https://www.strava.com/oauth/token (exchange code)
  │                    ├─ encrypt accessToken + refreshToken (AES-GCM)
  │                    ├─ upsertStravaConnection (DB write)
  │                    ├─ triggerActivityMatch (fetch 30 activities, match, DB update)
  │                    └─ redirect /dashboard?strava_connected=1
  │
  └─[dashboard load]─► RSC DashboardPage
                         │
                         ├─ findStravaConnectionByUserId → connected/disconnected state
                         ├─ listTrainingSessions → compute 6-week TSS weekly buckets
                         └─ render <StravaSection /> + <TSSChart data={weeklyData} />

User taps "Refresh":
  └─► Server Action: refreshStravaAction
        │
        ├─ findStravaConnectionByUserId
        ├─ proactive token refresh (expiresAt - 600s)
        │    └─ POST /oauth/token → encrypt → DB update
        ├─ GET /api/v3/athlete/activities?per_page=30 (with retry on 429)
        ├─ matchActivities(activities, sessions)
        ├─ updateSessionStravaMatch per matched pair
        └─ revalidatePath("/dashboard")
```

### Recommended Project Structure (Phase 5 additions)

```
src/
├── lib/
│   └── strava/
│       ├── crypto.ts       # AES-GCM encrypt/decrypt (Web Crypto API)
│       ├── client.ts       # fetchActivities(), refreshStravaToken()
│       └── match.ts        # matchActivitiesToSessions()
├── lib/actions/
│   └── strava.ts           # connectStravaAction, disconnectStravaAction, refreshStravaAction
├── lib/db/
│   └── queries.ts          # extend: findStravaConnectionByUserId, upsertStravaConnection,
│                           #         deleteStravaConnection, updateSessionStravaMatch
├── app/api/strava/
│   └── callback/
│       └── route.ts        # GET handler: OAuth callback
├── components/strava/
│   ├── strava-section.tsx  # "use client" — connected/disconnected/confirm states
│   └── tss-chart.tsx       # "use client" — Recharts BarChart wrapper
drizzle/
├── 0003_strava_token_columns.sql   # ADD COLUMN to strava_connections
└── 0004_session_strava_activity.sql # ADD COLUMN to training_sessions
```

### Pattern 1: AES-GCM Encrypt/Decrypt (Web Crypto API)

**What:** Encrypt Strava tokens before DB write; decrypt before use.
**When to use:** Any time `accessToken` or `refreshToken` is read from or written to DB.

```typescript
// Source: [ASSUMED] — Web Crypto API (MDN), Next.js 16 Node 20 runtime
// src/lib/strava/crypto.ts

const ALG = { name: "AES-GCM", length: 256 } as const;
const IV_BYTES = 16;

async function importKey(): Promise<CryptoKey> {
  const raw = Buffer.from(process.env.TOKEN_ENC_KEY!, "base64");
  return crypto.subtle.importKey("raw", raw, ALG, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // Prefix IV: base64(iv + ciphertext)
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_BYTES);
  return Buffer.from(combined).toString("base64");
}

export async function decryptToken(stored: string): Promise<string> {
  const key = await importKey();
  const combined = Buffer.from(stored, "base64");
  const iv = combined.subarray(0, IV_BYTES);
  const ciphertext = combined.subarray(IV_BYTES);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
```

**Note:** `crypto.subtle` is available globally in Node.js 20+ and Next.js 16 Edge runtime — no `import crypto` needed. [ASSUMED]

### Pattern 2: Strava OAuth State + Redirect (Server Action)

**What:** Store CSRF state in iron-session, redirect to Strava.
**Constraint:** Server Actions cannot use `next/navigation` `redirect()` inside a try/catch; call redirect after the try block.

```typescript
// Source: [ASSUMED] — Next.js 16 Server Action pattern
// src/lib/actions/strava.ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { STRAVA_CLIENT_ID, APP_BASE_URL } from "@/env";

export async function connectStravaAction() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.id) redirect("/login");

  const state = crypto.randomUUID();
  // Store state — iron-session requires explicit save
  (session as any).pending_strava_state = state;
  await session.save();

  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID!,
    redirect_uri: `${APP_BASE_URL}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read",
    state,
  });

  redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
```

**Note:** `SessionData` type in `src/lib/session.ts` must be extended to include `pending_strava_state?: string`. [ASSUMED]

### Pattern 3: OAuth Callback Route Handler

**What:** GET Route Handler at `/api/strava/callback`.
**Critical sequence:** validate → delete state → check scope → exchange → encrypt → upsert → match → redirect.

```typescript
// Source: [ASSUMED] — Next.js 16 Route Handler pattern
// src/app/api/strava/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, APP_BASE_URL } from "@/env";
import { encryptToken } from "@/lib/strava/crypto";
import { upsertStravaConnection } from "@/lib/db/queries";
import { fetchAndMatchActivities } from "@/lib/strava/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope") ?? "";
  const error = searchParams.get("error");

  // Strava sends error=access_denied on user cancel
  if (error) return NextResponse.redirect(new URL("/dashboard?strava_error=cancelled", APP_BASE_URL!));

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.id) return NextResponse.redirect(new URL("/login", APP_BASE_URL!));

  // CSRF check
  const expectedState = (session as any).pending_strava_state;
  delete (session as any).pending_strava_state;
  await session.save();

  if (!state || state !== expectedState) {
    return NextResponse.redirect(new URL("/dashboard?strava_error=state_mismatch", APP_BASE_URL!));
  }

  // Scope check
  if (!scope.includes("activity:read")) {
    return NextResponse.redirect(new URL("/dashboard?strava_error=scope_denied", APP_BASE_URL!));
  }

  // Token exchange
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL("/dashboard?strava_error=token_exchange", APP_BASE_URL!));

  const token = await tokenRes.json();
  const [encAccess, encRefresh] = await Promise.all([
    encryptToken(token.access_token),
    encryptToken(token.refresh_token),
  ]);

  await upsertStravaConnection(session.id, {
    stravaAthleteId: BigInt(token.athlete.id),
    accessToken: encAccess,
    refreshToken: encRefresh,
    expiresAt: token.expires_at,
    scope,
    athleteName: `${token.athlete.firstname} ${token.athlete.lastname}`,
  });

  // Trigger initial match (best-effort; errors don't block redirect)
  try {
    await fetchAndMatchActivities(session.id);
  } catch { /* log but don't fail */ }

  return NextResponse.redirect(new URL("/dashboard?strava_connected=1", APP_BASE_URL!));
}
```

### Pattern 4: Proactive Token Refresh

**What:** Before any Strava API call, check if token is within 10 minutes of expiry.

```typescript
// Source: [ASSUMED]
// src/lib/strava/client.ts
import { decryptToken, encryptToken } from "./crypto";
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from "@/env";
import { updateStravaTokens } from "@/lib/db/queries";

export async function getValidAccessToken(connection: StravaConnection): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expiresAt > now + 600) {
    return decryptToken(connection.accessToken);
  }
  // Refresh needed
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: await decryptToken(connection.refreshToken),
    }),
  });
  if (!res.ok) throw new Error("STRAVA_401"); // Caller handles as disconnected
  const token = await res.json();
  const [encAccess, encRefresh] = await Promise.all([
    encryptToken(token.access_token),
    encryptToken(token.refresh_token),
  ]);
  await updateStravaTokens(connection.userId, {
    accessToken: encAccess,
    refreshToken: encRefresh,
    expiresAt: token.expires_at,
  });
  return token.access_token;
}
```

### Pattern 5: Exponential Backoff on 429

**What:** 3 retries with 1s, 2s, 4s delays before surfacing error.

```typescript
// Source: [ASSUMED]
async function fetchWithBackoff(url: string, accessToken: string): Promise<Response> {
  const delays = [1000, 2000, 4000];
  let lastResponse: Response | undefined;
  for (let i = 0; i <= delays.length; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status !== 429) return res;
    lastResponse = res;
    if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
  }
  return lastResponse!; // Returns the 429 response; caller throws STRAVA_429
}
```

### Pattern 6: Activity Match Algorithm

**What:** Match Strava activities to training sessions by date + duration ±20%.

```typescript
// Source: [ASSUMED]
// src/lib/strava/match.ts

type StravaActivity = { id: number; start_date: string; elapsed_time: number };
type TrainingSession = { id: string; createdAt: Date; totalDurationSec: number };

export function matchActivities(
  activities: StravaActivity[],
  sessions: TrainingSession[]
): Array<{ sessionId: string; stravaActivityId: bigint }> {
  const results: Array<{ sessionId: string; stravaActivityId: bigint }> = [];

  for (const session of sessions) {
    const sessionDate = session.createdAt.toISOString().slice(0, 10); // UTC date
    const minDur = session.totalDurationSec * 0.8;
    const maxDur = session.totalDurationSec * 1.2;

    const matched = activities.find((a) => {
      const actDate = new Date(a.start_date).toISOString().slice(0, 10);
      return actDate === sessionDate && a.elapsed_time >= minDur && a.elapsed_time <= maxDur;
    });

    if (matched) {
      results.push({ sessionId: session.id, stravaActivityId: BigInt(matched.id) });
    }
  }
  return results;
}
```

### Pattern 7: TSS Chart Data Aggregation (in-memory)

**What:** Group matched sessions into 6 weekly buckets, sum TSS per bucket.

```typescript
// Source: [ASSUMED]
// Computed in DashboardPage RSC (server-side, zero overhead)
import { computeTSS } from "@/lib/training/tss";

type WeeklyBucket = { weekLabel: string; tss: number };

function buildWeeklyTSS(sessions: TrainingSession[], ftp: number | null): WeeklyBucket[] {
  const now = new Date();
  const buckets: WeeklyBucket[] = [];

  for (let w = 5; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - w * 7); // Sunday start
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const tss = sessions
      .filter((s) => s.stravaActivityId && s.createdAt >= weekStart && s.createdAt < weekEnd)
      .reduce((sum, s) => {
        const t = computeTSS(s.blocks as Block[], ftp);
        return sum + (t ?? 0);
      }, 0);

    buckets.push({ weekLabel: label, tss });
  }
  return buckets;
}
```

### Pattern 8: Recharts BarChart (Client Component)

**What:** Render weekly TSS as orange bar chart with empty state overlay.

```typescript
// Source: [ASSUMED — CLAUDE.md confirms recharts 3.8.1]
// src/components/strava/tss-chart.tsx
"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import { COPY } from "@/lib/copy";

export function TSSChart({ data }: { data: Array<{ weekLabel: string; tss: number }> }) {
  const isEmpty = data.every((d) => d.tss === 0);
  return (
    <div className="relative h-[300px] w-full">
      <ResponsiveContainer width="100%" height={300}
        aria-label="Weekly training load bar chart, 6-week rolling window">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Bar dataKey="tss" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center px-4">
            {COPY.CHART_TSS_EMPTY_LABEL}
          </p>
        </div>
      )}
    </div>
  );
}
```

### Pattern 9: Drizzle Schema Extension (bigint columns)

**What:** Drizzle `bigint` column mode for Strava athlete IDs (Strava IDs exceed JS `number` safe integer range).

```typescript
// Source: [ASSUMED — Drizzle docs bigint pattern]
import { bigint } from "drizzle-orm/pg-core";

// In stravaConnections table:
stravaAthleteId: bigint("strava_athlete_id", { mode: "bigint" }).notNull(),

// In trainingSessions table:
stravaActivityId: bigint("strava_activity_id", { mode: "bigint" }),
```

**Note:** Drizzle's `{ mode: "bigint" }` returns a JavaScript `BigInt` in TypeScript, not a `number`. Comparisons and JSON serialization need `Number(id)` or `String(id)` at boundaries. [ASSUMED]

### Pattern 10: SessionData Extension for pending_strava_state

**What:** iron-session's `SessionData` type needs the CSRF state field.

```typescript
// src/lib/session.ts — extend SessionData
export interface SessionData {
  id: string;
  email: string;
  pending_strava_state?: string; // OAuth CSRF — deleted after callback validation
}
```

### Anti-Patterns to Avoid

- **Storing plaintext tokens:** Any `accessToken` or `refreshToken` write to DB must go through `encryptToken()`. Never bypass for debugging.
- **Chained `.where()` in Drizzle:** Single `and(eq(table.userId, userId), eq(table.id, id))` — Drizzle silently drops the first `.where()` when chained (existing project truth-condition).
- **`redirect()` inside try/catch in Server Actions:** Next.js `redirect()` throws a special error type; catching it prevents the redirect. Always call after the try block.
- **Calling `session.save()` in RSC:** Session writes only in Route Handlers and Server Actions — not in Server Components (established Phase 3 decision).
- **`importKey()` on every encrypt/decrypt call:** Consider caching the `CryptoKey` in module scope — `importKey` is computationally cheap but unnecessarily repeated. A module-level singleton is fine since the key doesn't change.
- **Matching by session date using local time:** Use `.toISOString().slice(0, 10)` for UTC date comparison on both sides. Local timezone can shift the date by one day.
- **Serializing `BigInt` in JSON:** `JSON.stringify({ id: BigInt(123) })` throws. Convert to `String` or `Number` before any JSON boundary (API response, RSC prop).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM encryption | Custom XOR / base64 obfuscation | `crypto.subtle` (Web Crypto API built-in) | Authenticated encryption; tamper-detection built in |
| OAuth CSRF protection | Custom DB table for state | iron-session `pending_strava_state` | Reuses existing infrastructure; auto-expires with cookie |
| Token refresh lock (concurrent requests) | DB mutex / advisory lock | Proactive 10-min buffer (D-07) | In single-user v1, race window is negligible; 10-min buffer prevents concurrent refresh need |
| Activity date comparison | Custom timezone math | `.toISOString().slice(0, 10)` (UTC) | Correct, simple, no date library needed |
| Retry logic | `p-retry` or similar | Inline `for` loop with `setTimeout` | 3 retries at fixed delays — not worth a dependency |

**Key insight:** Web Crypto is the right tool for token encryption at rest. Adding `node-forge`, `crypto-js`, or `jose` would introduce an external dependency for something the platform provides natively.

---

## Common Pitfalls

### Pitfall 1: `redirect()` Swallowed by try/catch in Server Actions
**What goes wrong:** The Server Action completes without redirecting; user sees no response.
**Why it happens:** Next.js `redirect()` internally throws a `NEXT_REDIRECT` error. A `catch (e)` block catches it and swallows it.
**How to avoid:** Never wrap `redirect()` in a try/catch. Structure as: do work in try, call redirect after the block.
**Warning signs:** Server Action returns without navigating; no error logged but no redirect occurs.

### Pitfall 2: BigInt Serialization at RSC → Client Component Boundary
**What goes wrong:** `Error: BigInt value can't be serialized.` at the Next.js serialization boundary when passing Drizzle `bigint` column values from RSC to a Client Component as props.
**Why it happens:** Next.js uses JSON serialization for RSC → Client prop handoff; `BigInt` is not JSON-serializable.
**How to avoid:** Convert `stravaActivityId` to `string` (or `number` if within safe range, but Strava IDs are large — use `string`) before passing as a prop. Alternatively use `Number(id)` if you're sure it fits (Strava IDs are ~10 digits — safely within `Number.MAX_SAFE_INTEGER`).
**Warning signs:** Hydration error or serialization error in dev console.

### Pitfall 3: OAuth State Replay Attack if Session Not Saved Before Redirect
**What goes wrong:** CSRF validation fails on every callback because `pending_strava_state` was never persisted.
**Why it happens:** iron-session requires explicit `session.save()` before the `redirect()` call. If `redirect()` happens first, the state is lost.
**How to avoid:** Always `await session.save()` before `redirect()` in `connectStravaAction`.
**Warning signs:** Callback always returns `state_mismatch` error.

### Pitfall 4: Token Exchange Receives Already-Used Code
**What goes wrong:** Strava returns `400` with `{ "message": "Authorization code already used" }`.
**Why it happens:** Callback Route Handler is called twice (browser preloading, duplicate request, or middleware retry).
**How to avoid:** Delete `pending_strava_state` from session at the start of the callback before the token exchange — this is already D-01 pattern (delete immediately after validation). Second call will fail state check and redirect to error page cleanly.
**Warning signs:** `tokenRes.ok === false` with 400 response on second callback invocation.

### Pitfall 5: AES-GCM Key Import Fails on Wrong Base64 Length
**What goes wrong:** `crypto.subtle.importKey` throws `DOMException: The provided data is too small`.
**Why it happens:** AES-256-GCM requires exactly 32 bytes. A `TOKEN_ENC_KEY` that is 32 characters but ASCII (not 32 bytes) will fail.
**How to avoid:** Generate with `openssl rand -base64 32` (produces 44 base64 chars = 32 bytes). Document this in env setup. Validate at startup: `if (Buffer.from(TOKEN_ENC_KEY, "base64").length !== 32) throw new Error(...)`.
**Warning signs:** `DOMException` on first encrypt call; only fails at runtime, not at build time.

### Pitfall 6: Strava `elapsed_time` vs `moving_time`
**What goes wrong:** Match algorithm never finds a match even though the user rode the session.
**Why it happens:** Strava activities expose both `elapsed_time` (wall clock including stops) and `moving_time` (time in motion). A session with intervals has rests; `moving_time` will be shorter than `totalDurationSec`. Use `elapsed_time` for matching.
**How to avoid:** Match against `activity.elapsed_time`, not `activity.moving_time`. [ASSUMED — based on Strava API field definitions]
**Warning signs:** No matches despite correct dates; match algorithm logs show duration comparison always failing.

### Pitfall 7: `upsertStravaConnection` Must Use `onConflictDoUpdate` on `userId`
**What goes wrong:** Duplicate key violation if user disconnects and reconnects.
**Why it happens:** `stravaConnections.userId` has a `.unique()` constraint. A plain INSERT on reconnect fails.
**How to avoid:** Use Drizzle's `.onConflictDoUpdate({ target: stravaConnections.userId, set: { ... } })`. This is the same pattern as `user_profiles` upsert (Phase 2 D-03).
**Warning signs:** `NeonDbError` with code `23505` on reconnect attempt.

### Pitfall 8: Rate Limit on Initial Match After Connect
**What goes wrong:** Hitting Strava 429 during the callback's initial match trigger, blocking the redirect.
**Why it happens:** If the user has many prior sessions, the match trigger fetches 30 activities and does N DB writes — within Strava's limits for a single call, but if called rapidly (test environments), the 100 req/15min limit is approached.
**How to avoid:** Wrap the initial match call in the callback with `try/catch` — errors don't block the redirect (already specified in Pattern 3). The user can Refresh manually if the initial match fails.
**Warning signs:** Callback times out or returns error before redirecting; `/dashboard?strava_error=...` appears unexpectedly.

---

## Runtime State Inventory

This is a feature addition phase (not a rename/refactor), so full runtime state inventory does not apply. However, note:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `stravaConnections` table skeleton exists (id, userId, createdAt only) | Migration 0003: add token columns |
| Stored data | `trainingSessions` table has no `stravaActivityId` column | Migration 0004: add column |
| Secrets/env vars | `TOKEN_ENC_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_BASE_URL` already exported from `src/env.ts` | Must be set in Vercel env — confirm before deploy |
| Build artifacts | None | None |
| Live service config | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥20.9 | `crypto.subtle` global | Verify | — | None — hard requirement |
| Strava API credentials | OAuth flow | Must be set | — | Phase cannot execute without them |
| `TOKEN_ENC_KEY` env var | AES-GCM key import | Must be set | — | Startup validation should throw if absent |
| `APP_BASE_URL` env var | OAuth callback URL | Must be set | — | No fallback; Strava redirect will point to wrong URL |
| Neon `DATABASE_URL_UNPOOLED` | drizzle-kit migrations | Already confirmed (prior phases) | — | — |

**Missing dependencies with no fallback:**
- Strava API credentials (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`) — must be provisioned in Vercel env before Phase 5 deploy. Plan should include a Wave 0 or pre-task checkpoint confirming these exist.
- `TOKEN_ENC_KEY` — 32-byte base64 key. Generate with `openssl rand -base64 32`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRAVA-05 | `encryptToken` → `decryptToken` round-trips correctly | unit | `npx vitest run src/lib/strava/crypto.test.ts` | ❌ Wave 0 |
| STRAVA-05 | Encrypted output differs from plaintext | unit | same | ❌ Wave 0 |
| STRAVA-01 | `matchActivities` returns correct match on date+duration overlap | unit | `npx vitest run src/lib/strava/match.test.ts` | ❌ Wave 0 |
| STRAVA-01 | `matchActivities` returns no match when date differs | unit | same | ❌ Wave 0 |
| STRAVA-01 | `matchActivities` returns no match when duration outside ±20% | unit | same | ❌ Wave 0 |
| STRAVA-04 | `fetchWithBackoff` retries on 429, succeeds on 3rd attempt | unit (mock fetch) | `npx vitest run src/lib/strava/client.test.ts` | ❌ Wave 0 |
| STRAVA-04 | `fetchWithBackoff` returns 429 after 3 exhausted retries | unit (mock fetch) | same | ❌ Wave 0 |
| PROG-02 | `buildWeeklyTSS` groups matched sessions into correct week buckets | unit | `npx vitest run src/lib/strava/tss-chart.test.ts` | ❌ Wave 0 |
| PROG-02 | `buildWeeklyTSS` returns zero TSS for weeks with no matched sessions | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/strava/crypto.test.ts` — covers STRAVA-05
- [ ] `src/lib/strava/match.test.ts` — covers STRAVA-01/STRAVA-03
- [ ] `src/lib/strava/client.test.ts` — covers STRAVA-04 (mock `fetch` via `vi.stubGlobal`)
- [ ] `src/lib/strava/tss-chart.test.ts` — covers PROG-02 `buildWeeklyTSS` function

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | iron-session state check + scope confirmation in callback |
| V3 Session Management | yes | `pending_strava_state` deleted after single use; iron-session httpOnly cookie |
| V4 Access Control | yes | IDOR guard on all DB queries: `and(eq(table.userId, userId), ...)` |
| V5 Input Validation | yes | Validate `state`, `code`, `scope` params in callback before any DB write |
| V6 Cryptography | yes | AES-GCM via `crypto.subtle`; 16-byte random IV per encrypt; 256-bit key |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on OAuth callback | Spoofing | Cryptographic state parameter (D-01); must match session value |
| Token theft from DB | Information Disclosure | AES-GCM at rest (STRAVA-05); `TOKEN_ENC_KEY` never in client bundle |
| IDOR on Strava data | Elevation of Privilege | `findStravaConnectionByUserId(userId)` — userId scopes all queries |
| Scope escalation (more than requested) | Elevation of Privilege | Explicit `activity:read` scope check on callback; reject if absent |
| Stale/replayed auth code | Spoofing | Delete `pending_strava_state` on first callback use; Strava auth codes are single-use |
| 401 from Strava → silent fail | Tampering | 401 = prompt reconnect; do not silently retry with stale tokens |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-forge` / `crypto-js` for browser crypto | Web Crypto API (`crypto.subtle`) | Node.js 15+ / Web platform standard | No external package; authenticated encryption built in |
| `next-auth` for OAuth | Custom iron-session + direct Strava API | Project decision (Phase 1) | Smaller dependency surface; full control over token handling |
| Strava `refresh_token_expires_at` field | Ignored in v1 | — | Strava refresh tokens are long-lived (valid 6mo+); not required for v1 |

**Deprecated / not applicable:**
- `next-auth`/`Auth.js` Strava provider — project uses custom OAuth flow (Phase 1 decision, locked).
- `node-forge` — unnecessary when `crypto.subtle` is available.
- Strava webhooks — deferred to v2 (STRAVA-V2-01).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crypto.subtle` is available as a global in Next.js 16 / Node 20+ without explicit import | Pattern 1 | Would need `import { webcrypto } from "node:crypto"` polyfill; low-risk fix |
| A2 | Strava `elapsed_time` is the correct field to match against `totalDurationSec` | Pattern 6, Pitfall 6 | If `moving_time` is better, match rate drops for sessions with rests; can be toggled |
| A3 | Strava athlete IDs fit within JavaScript `Number.MAX_SAFE_INTEGER` (2^53-1) | Pattern 9 | Current Strava IDs are ~9-10 digits (~10^9); well within 2^53. Low risk. |
| A4 | `crypto.subtle.importKey` for AES-256-GCM accepts `{ name: "AES-GCM", length: 256 }` as algorithm | Pattern 1 | If `length` param is wrong, `importKey` throws; trivially testable in Wave 0 |
| A5 | Recharts `<Bar radius={[4, 4, 0, 0]}>` prop syntax is valid in recharts 3.8.1 | Pattern 8 | If API changed, use `radius={4}` as fallback; visual-only impact |
| A6 | `buildWeeklyTSS` week boundaries using `getDate() - getDay()` correctly computes Sunday-start weeks in UTC | Pattern 7 | Off-by-one in week bucketing; testable in Wave 0 |

---

## Open Questions (RESOLVED)

1. **`SESSION_SECRET` env var name consistency**
   - What we know: `src/lib/session.ts` reads `process.env.SESSION_SECRET` directly (not via `src/env.ts`).
   - What was unclear: Whether `TOKEN_ENC_KEY` startup validation should be co-located with other startup checks in `src/env.ts`.
   - **RESOLVED:** 05-01 Task 1 adds a 32-byte length check for `TOKEN_ENC_KEY` directly in `src/env.ts` (immediately after the existing export), matching the style of the `ANTHROPIC_API_KEY` guard. `SESSION_SECRET` remains read directly by `session.ts` (existing pattern; not changed).

2. **Strava brand SVG asset**
   - What we know: Must be stored at `public/connect-with-strava.svg` (not hotlinked). UI-SPEC confirms this.
   - What was unclear: The exact download URL for the official Strava button asset.
   - **RESOLVED:** 05-01 Task 3 (the checkpoint task) instructs the executor to download the SVG from `https://developers.strava.com/guidelines/` and store it at `public/connect-with-strava.svg`. The file path is listed in `files_modified` for 05-01 — it is an explicit planned artifact.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db/schema.ts` — confirmed `stravaConnections` skeleton and `trainingSessions` columns [VERIFIED: codebase]
- `src/lib/session.ts` — confirmed `SessionData` type, `sessionOptions` pattern [VERIFIED: codebase]
- `src/lib/db/queries.ts` — confirmed IDOR and() pattern, existing query helpers [VERIFIED: codebase]
- `src/lib/training/tss.ts` — confirmed `computeTSS` signature and return type [VERIFIED: codebase]
- `src/env.ts` — confirmed all 4 Strava env vars already exported [VERIFIED: codebase]
- `.planning/phases/05-strava-integration/05-CONTEXT.md` — all locked decisions [VERIFIED: planning artifact]
- `.planning/phases/05-strava-integration/05-UI-SPEC.md` — UI component inventory, copy keys, layout contract [VERIFIED: planning artifact]
- `CLAUDE.md` — stack versions (recharts 3.8.1, iron-session 8.0.4, Next.js 16) [VERIFIED: project instructions]

### Secondary (MEDIUM confidence)
- Strava API reference (from additional_context): token exchange URL, activities endpoint, 429 behavior [CITED: https://developers.strava.com/docs/authentication/]

### Tertiary (LOW confidence / ASSUMED)
- Web Crypto API `crypto.subtle` global availability in Next.js 16 Node 20 runtime [ASSUMED]
- Strava `elapsed_time` vs `moving_time` correct field for duration matching [ASSUMED]
- Recharts 3.8.1 `radius` prop array syntax on `<Bar>` [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already installed; versions from CLAUDE.md
- Architecture: HIGH — all decisions locked in CONTEXT.md; patterns derived from existing codebase
- Crypto patterns: MEDIUM — Web Crypto API is standard but runtime availability is ASSUMED
- Activity matching: MEDIUM — algorithm is straightforward; `elapsed_time` field choice is ASSUMED
- Pitfalls: HIGH — derived from existing project patterns (IDOR, redirect(), session.save(), upsert)

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (Strava API is stable; recharts 3.x is stable)
