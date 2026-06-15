# Phase 3: AI Session Generation - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` (modify) | model | CRUD | `src/lib/db/schema.ts` itself | exact |
| `src/lib/db/migrations/0003_*.sql` (new) | migration | batch | `drizzle-kit` generated pattern | role-match |
| `src/lib/db/schemas/session.ts` (new) | utility/schema | transform | `src/lib/db/schemas/profile.ts` | exact |
| `src/lib/safety-gate.ts` (new) | utility | transform | `src/lib/db/queries.ts` (pure function style) | partial |
| `src/lib/ratelimit.ts` (modify) | middleware | request-response | `src/lib/ratelimit.ts` itself | exact |
| `src/lib/actions/session.ts` (new) | service/action | request-response | `src/lib/actions/profile.ts` | exact |
| `src/lib/db/queries.ts` (modify) | model | CRUD | `src/lib/db/queries.ts` itself | exact |
| `src/components/session/session-generator.tsx` (new) | component | request-response | `src/components/onboarding/onboarding-wizard.tsx` | role-match |

---

## Pattern Assignments

### `src/lib/db/schema.ts` (modify — extend trainingSessions)

**Analog:** `src/lib/db/schema.ts` lines 59–70

**Existing stub** (lines 59–70):
```typescript
export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("training_sessions_user_id_idx").on(t.userId)]
);
```

**Import pattern to extend** (line 16):
```typescript
import { pgTable, uuid, text, timestamp, index, integer, real, boolean } from "drizzle-orm/pg-core";
```
Add `jsonb` to this import. No other import changes needed.

**Phase 3 column additions** — inject between `userId` and `createdAt`:
```typescript
title: text("title").notNull(),
notes: text("notes"),
readinessScore: integer("readiness_score").notNull(),
blocks: jsonb("blocks").notNull(),
totalDurationSec: integer("total_duration_sec").notNull(),
rawJson: text("raw_json"),   // nullable; debug only; never display to user
```

**Column ordering convention:** follows `userProfiles` pattern — FK first, domain columns next, timestamps last (lines 33–53).

---

### `src/lib/db/migrations/0003_training_sessions_content.sql` (new)

**Analog:** drizzle-kit generated via `npx drizzle-kit generate` — do not hand-write.

**Generation command:**
```bash
DATABASE_URL_UNPOOLED=<value> npx drizzle-kit generate
DATABASE_URL_UNPOOLED=<value> npx drizzle-kit migrate
```

**Expected ALTER TABLE shape** (for reference only — let drizzle-kit produce the file):
```sql
ALTER TABLE "training_sessions"
  ADD COLUMN "title" text NOT NULL,
  ADD COLUMN "notes" text,
  ADD COLUMN "readiness_score" integer NOT NULL,
  ADD COLUMN "blocks" jsonb NOT NULL,
  ADD COLUMN "total_duration_sec" integer NOT NULL,
  ADD COLUMN "raw_json" text;
```

---

### `src/lib/db/schemas/session.ts` (new)

**Analog:** `src/lib/db/schemas/profile.ts` (lines 1–23)

**Imports pattern** (from profile.ts lines 13–14):
```typescript
import { z } from "zod";
```

**Schema export pattern** (from profile.ts lines 15–22):
```typescript
export const profileSchema = z.object({
  goals: z.string().min(1, "...").max(1000),
  ftp: z.coerce.number().int().min(50).max(700).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
```

**New session schema** — copy structure, use D-03 spec values:
```typescript
import { z } from "zod";

export const SessionBlockSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(["warmup", "work", "rest", "cooldown"]),
  durationSec: z.number().int().positive().max(5400),
  powerFraction: z.number().min(0.1).max(1.8),
  targetWatts: z.number().int().positive(),
  rpe: z.enum(["Easy", "Moderate", "Hard", "Very Hard"]),
  description: z.string().min(1).max(200),
});

export const GeneratedSessionSchema = z.object({
  title: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  totalDurationSec: z.number().int().positive().max(14400),
  blocks: z.array(SessionBlockSchema).min(1).max(20),
});

export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>;
```

**Zod v4 critical:** `error.issues` not `error.errors` — enforced in profile.ts line 41 (`result.error.issues`).

---

### `src/lib/safety-gate.ts` (new)

**Analog:** No existing analog — pure utility function. Pattern: pure TypeScript function with typed input/output (no DB, no async). See `src/lib/db/queries.ts` for file-level comment style.

**File-level comment pattern** (from queries.ts lines 1–12):
```typescript
/**
 * validateSessionSafety — deterministic safety gate (D-04).
 *
 * Runs AFTER Zod parse (D-09 order). Input is always a valid GeneratedSession.
 * Returns { safe: boolean; reason?: string }. Reason is server-log only — never
 * surface to user. User sees generic "Couldn't generate a valid session." message.
 */
```

**Core function pattern** — standalone export, synchronous, no side effects:
```typescript
import type { GeneratedSession } from "@/lib/db/schemas/session";

export function validateSessionSafety(
  session: GeneratedSession
): { safe: boolean; reason?: string } {
  // 4 checks per D-04 — see CONTEXT.md
}
```

---

### `src/lib/ratelimit.ts` (modify — add generationLimiter)

**Analog:** `src/lib/ratelimit.ts` lines 37–55 (existing `ipLimiter`/`emailLimiter`)

**Existing UPSTASH_AVAILABLE guard pattern** (lines 23–31) — already in file, do not re-declare:
```typescript
const UPSTASH_AVAILABLE =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const PASS_THROUGH = {
  limit: async () => ({ success: true as const, limit: 999, remaining: 999, reset: 0 }),
};

const redis = UPSTASH_AVAILABLE ? Redis.fromEnv() : null;
```

**Existing limiter pattern to copy** (lines 37–43):
```typescript
export const ipLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:login:ip",
    })
  : PASS_THROUGH;
```

**New limiter to append** — change window, prefix, count only:
```typescript
/**
 * Per-user generation limiter: 10 requests per 24 hours.
 * Key: userId (UUID from iron-session) — prevents email alias bypass (Pitfall 6).
 * Error message: "Daily limit reached. Try again tomorrow." (GEN-03)
 */
export const generationLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "24 h"),
      prefix: "rl:generate:user",
    })
  : PASS_THROUGH;
```

**Usage in action:**
```typescript
const limitResult = await generationLimiter.limit(userId);  // userId from iron-session, never from client
if (!limitResult.success) {
  return { error: "Daily limit reached. Try again tomorrow." };
}
```

---

### `src/lib/actions/session.ts` (new)

**Analog:** `src/lib/actions/profile.ts` (all 61 lines)

**File header pattern** (profile.ts lines 1–18):
```typescript
'use server'

/**
 * generateSessionAction — Server Action for AI session generation.
 *
 * Security contract:
 *   - userId is ALWAYS read from iron-session; never from client input.
 *   - ANTHROPIC_API_KEY imported from @/env.ts (server-only; no NEXT_PUBLIC_ prefix).
 *   - AI output validated through two gates (Zod + safety) before any DB write (D-09).
 */
```

**Imports pattern** (extend profile.ts lines 19–26):
```typescript
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { db } from '@/lib/db/index'
import { trainingSessions } from '@/lib/db/schema'
import { findUserProfileByUserId } from '@/lib/db/queries'
import { GeneratedSessionSchema, type GeneratedSession } from '@/lib/db/schemas/session'
import { validateSessionSafety } from '@/lib/safety-gate'
import { generationLimiter } from '@/lib/ratelimit'
import { ANTHROPIC_API_KEY } from '@/env'
import Anthropic from '@anthropic-ai/sdk'
```

**Auth gate pattern** (profile.ts lines 29–31) — identical, copy exactly:
```typescript
const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
if (!session.id) redirect('/login')
```

**Action signature** — differs from profile.ts (typed arg, not FormData; returns data inline):
```typescript
export async function generateSessionAction(
  readinessScore: number
): Promise<{ data?: GeneratedSession; error?: string }> {
  // D-09 execution order: auth → profile → rate limit → AI → Zod → safety → DB → return
}
```

**Zod safeParse error pattern** (mirror profile.ts line 41, using `.issues` not `.errors`):
```typescript
const zodResult = GeneratedSessionSchema.safeParse(jsonParsed)
if (!zodResult.success) {
  console.error("Zod issues:", zodResult.error.issues)  // server-log only
  return { error: "Couldn't generate a valid session. Please try again." }
}
```

**DB insert pattern** (mirror profile.ts lines 44–56, but use `.insert().values().returning()`):
```typescript
const [inserted] = await db
  .insert(trainingSessions)
  .values({
    userId,
    title: zodResult.data.title,
    notes: zodResult.data.notes,
    readinessScore,
    blocks: blocksWithWatts as unknown as import('drizzle-orm').JsonValue,
    totalDurationSec: zodResult.data.totalDurationSec,
    rawJson: rawText,
  })
  .returning()
return { data: inserted }
```

**Key difference from profile.ts:** No `revalidatePath` + `redirect()` at end — returns `{ data }` inline. Do NOT call `revalidatePath` (triggers useTransition/isPending bug in Next.js 15+, per RESEARCH.md Pattern 6).

---

### `src/lib/db/queries.ts` (modify — add session insert/find helpers)

**Analog:** `src/lib/db/queries.ts` lines 29–45 (`findTrainingSession`)

**Existing IDOR-safe query pattern** (lines 29–45):
```typescript
export async function findTrainingSession(
  userId: string,
  sessionId: string
) {
  const rows = await db
    .select()
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.id, sessionId)
      )
    );
  return rows[0] ?? null;
}
```

**New helper to add** — latest session for dashboard display:
```typescript
/**
 * Fetch the most recently generated session for the authenticated user.
 * Single eq() is correct here — no secondary resource id to guard.
 */
export async function findLatestSessionByUserId(userId: string) {
  const rows = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.userId, userId))
    .orderBy(desc(trainingSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
```

Add `desc` to drizzle-orm import (line 13): `import { and, eq, desc } from "drizzle-orm";`

---

### `src/components/session/session-generator.tsx` (new)

**Analog:** `src/components/onboarding/onboarding-wizard.tsx` (lines 1–56 for hooks/imports; lines 58–90 for state pattern)

**"use client" + imports pattern** (onboarding-wizard.tsx lines 1–34):
```typescript
"use client";

import { useState, useTransition } from "react";   // useTransition NOT useActionState (non-form)
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { generateSessionAction } from "@/lib/actions/session";
import type { GeneratedSession } from "@/lib/db/schemas/session";
```

**State pattern** (mirror onboarding-wizard.tsx lines 59–66, adapted for imperative call):
```typescript
export function SessionGenerator({ profile }: { profile: UserProfile | null }) {
  const [isPending, startTransition] = useTransition();
  const [readiness, setReadiness] = useState<number | null>(null);
  const [result, setResult] = useState<{ data?: GeneratedSession; error?: string } | null>(null);
```

**Imperative action call pattern** — key difference from onboarding-wizard (which uses `useActionState` + form):
```typescript
function handleGenerate() {
  if (readiness === null) return;
  startTransition(async () => {
    const res = await generateSessionAction(readiness);
    setResult(res);
  });
}
```

**ErrorBanner usage pattern** (onboarding-wizard.tsx lines 297–299):
```typescript
{result?.error && <ErrorBanner message={result.error} />}
```

**Button disabled/loading pattern** (onboarding-wizard.tsx lines 40–55):
```typescript
<Button
  onClick={handleGenerate}
  disabled={isPending || readiness === null}
  aria-busy={isPending}
  className="h-12 w-full text-base font-medium"
>
  {isPending ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Generating...
    </>
  ) : (
    "Generate Session"
  )}
</Button>
```

**Card component pattern** (onboarding-wizard.tsx lines 107–108):
```typescript
<Card className="w-full max-w-lg bg-card">
  <CardContent className="p-8">
```

---

## Shared Patterns

### Authentication (iron-session)
**Source:** `src/lib/actions/profile.ts` lines 29–31
**Apply to:** `src/lib/actions/session.ts`
```typescript
const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
if (!session.id) redirect('/login')
```
`await cookies()` is mandatory — Next.js 16 async cookies.

### Error handling (Server Actions)
**Source:** `src/lib/actions/profile.ts` line 41
**Apply to:** `src/lib/actions/session.ts`
```typescript
// Zod v4: .issues not .errors
return { errors: result.error.issues }
```
Generic user-visible messages only. Server-log `error.issues` / safety `reason`, never forward to client.

### IDOR-safe WHERE clause
**Source:** `src/lib/db/queries.ts` lines 34–44
**Apply to:** any query in `src/lib/db/queries.ts` that filters by both userId AND a resource id
```typescript
.where(
  and(
    eq(trainingSessions.userId, userId),
    eq(trainingSessions.id, sessionId)
  )
)
// NEVER chain: .where(eq(...)).where(eq(...))
```

### Environment variables (server-only)
**Source:** `src/env.ts` lines 31–33
**Apply to:** `src/lib/actions/session.ts` (ANTHROPIC_API_KEY)
```typescript
// Import from @/env, never process.env directly in action files
import { ANTHROPIC_API_KEY } from '@/env'
```

### ErrorBanner display
**Source:** `src/components/ui/error-banner.tsx` — props: `{ message: string | null }`
**Apply to:** `src/components/session/session-generator.tsx`
```typescript
<ErrorBanner message={result?.error ?? null} />
```

---

## No Analog Found

All files have analogs. The `src/lib/safety-gate.ts` has no direct role-match but is a simple pure-function utility — no analog needed beyond TypeScript function conventions already present throughout the codebase.

---

## Metadata

**Analog search scope:** `src/lib/actions/`, `src/lib/db/`, `src/lib/`, `src/components/`, `src/app/(app)/dashboard/`
**Files scanned:** 10
**Pattern extraction date:** 2026-06-14
