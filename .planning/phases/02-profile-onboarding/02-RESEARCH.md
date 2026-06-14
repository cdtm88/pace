# Phase 2: Profile & Onboarding — Research

**Researched:** 2026-06-14
**Domain:** Multi-step onboarding wizard, profile schema migration, Coggan power zone utility
**Confidence:** MEDIUM

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROF-01 | New user is guided through an onboarding wizard capturing training goals, injury notes, and optionally FTP and weight; FTP is not required | Client-state wizard with Server Action final persist; schema adds nullable ftp/weight/goals/injuries columns; redirect to dashboard on complete |
| PROF-02 | User can edit their profile at any time after onboarding; FTP can be added later | Same Server Action as onboarding (upsert pattern via onConflictDoUpdate on userId); /profile edit page reads existing profile data via RSC |
| PROF-03 | When FTP is present, it is used as reference for watt targets and zone labels; when absent, RPE descriptions used without error | Pure TypeScript zone utility function in lib/training/zones.ts; returns null or zone object; callers check for null and render RPE fallback |
</phase_requirements>

---

## Summary

Phase 2 adds profile data to the `user_profiles` table (currently skeleton-only), implements a 3-step onboarding wizard that new users complete once, and provides a profile edit page for returning users. The Coggan zone utility is a pure function consumed by Phase 3 (AI generation) and Phase 4 (Today view) — it lives here because both downstream phases depend on it.

The profile schema migration is the first Drizzle migration on top of the Phase 1 schema. The wizard uses **client-side React state for step tracking** (no URL params, no global store) with a single Server Action that fires on the final step, writing all fields to the database in one upsert. The edit page uses the same Server Action path. No new npm packages are required for this phase.

The `onboarding_complete` boolean column gates the wizard: new users who haven't completed onboarding are redirected from `/dashboard` to `/onboarding`. Users who have completed onboarding skip directly to the dashboard.

**Primary recommendation:** Client-state wizard (useState step tracking) + single Server Action upsert on final step + `revalidatePath('/dashboard')` + `redirect('/dashboard')`. No wizard libraries, no URL step params.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Profile schema (columns) | Database / Storage | — | Drizzle schema + migration; no business logic |
| Onboarding wizard UI (step navigation) | Browser / Client | — | Client state via useState; steps do not need to survive page refresh |
| Profile save / update | API / Backend (Server Action) | — | Authenticated mutation; calls getIronSession to verify userId |
| Onboarding redirect gate | Frontend Server (RSC) | — | Dashboard layout reads profile to decide if wizard redirect is needed |
| Coggan zone calculation | API / Backend (utility) | Browser / Client | Pure function used server-side in Phase 3 prompt building AND client-side in Phase 4 zone label display |
| Profile read for edit page | Frontend Server (RSC) | — | RSC fetches existing profile from DB to pre-populate form |

---

## Standard Stack

### Core (all already installed — no new npm installs required)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `drizzle-orm` | 0.45.2 | Schema + upsert query | `onConflictDoUpdate` for profile upsert |
| `drizzle-kit` | 0.31.10 | Migration generation + apply | `generate` then `migrate` against `DATABASE_URL_UNPOOLED` |
| `@neondatabase/serverless` | 1.1.0 | Neon HTTP driver | No change from Phase 1 |
| `zod` | 4.4.3 | Profile input validation | `z.coerce.number()` for FTP/weight from FormData strings |
| `iron-session` | 8.0.4 | Auth in Server Actions | `getIronSession(await cookies(), sessionOptions)` |
| `next` | 16.2.9 | Server Actions, RSC, redirect | `useActionState` from `react`, `revalidatePath`/`redirect` from `next/navigation` |

### Supporting (shadcn — add via `npx shadcn@latest add`)

The project uses `@base-ui/react` primitives wrapped as shadcn components. Phase 2 needs `<Textarea>` for goals/injuries text fields and a `<Progress>` bar for the wizard step indicator. Neither is in `src/components/ui/` yet.

| Component | Install Command | Purpose |
|-----------|----------------|---------|
| `textarea` | `npx shadcn@latest add textarea` | Goals and injury notes fields |
| `progress` | `npx shadcn@latest add progress` | Wizard step progress bar (3 steps) |

**Version verification:** All core packages verified via `npm view` as of 2026-06-14. shadcn component versions are determined at install time from the shadcn registry. [VERIFIED: npm registry]

### No New npm Packages

All required functionality (Server Actions, Drizzle upsert, Zod coercion, iron-session auth) is available from Phase 1's installed dependencies. The Coggan zone utility is a pure TypeScript function with zero dependencies.

**Installation (shadcn components only):**
```bash
npx shadcn@latest add textarea
npx shadcn@latest add progress
```

---

## Package Legitimacy Audit

No new npm packages are being installed in this phase. All packages are carry-overs from Phase 1 (verified OK in Phase 1 research).

| Package | Registry | Age | Downloads | Verdict | Disposition |
|---------|----------|-----|-----------|---------|-------------|
| drizzle-orm | npm | 3+ yrs | 11.1M/wk | OK | Approved (Phase 1 carry-over) |
| drizzle-kit | npm | 3+ yrs | 9.3M/wk | OK | Approved (Phase 1 carry-over) |
| zod | npm | 4+ yrs | 193M/wk | OK | Approved (Phase 1 carry-over) |
| iron-session | npm | 4+ yrs | 1.7M/wk | OK | Approved (Phase 1 carry-over) |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none

---

## Architecture Patterns

### System Architecture Diagram

```
New User Login
     │
     ▼
(app) Layout RSC — getIronSession + findUserProfile(userId)
     │
     ├─ profile.onboardingComplete === false ──► redirect('/onboarding')
     │                                                │
     │                                      OnboardingPage (RSC shell)
     │                                           │
     │                                  OnboardingWizard ('use client')
     │                                    useState { step: 1|2|3, formData: {...} }
     │                                           │
     │                              Step 1: Goals (text) → Next
     │                              Step 2: Injuries (text) → Next
     │                              Step 3: FTP? Weight? (optional) → Submit
     │                                           │
     │                                    <form action={saveProfileAction}>
     │                                           │
     │                                  saveProfileAction ('use server')
     │                                    getIronSession → userId
     │                                    Zod parse formData
     │                                    db.insert(userProfiles)
     │                                      .onConflictDoUpdate({ target: userId })
     │                                    revalidatePath('/dashboard')
     │                                    redirect('/dashboard')
     │
     └─ profile.onboardingComplete === true ──► Dashboard
                                                  │
                                             /profile edit page
                                               RSC: fetch existing profile
                                               <ProfileForm> ('use client')
                                               useActionState(saveProfileAction, null)
                                               Same saveProfileAction (upsert)
```

### Recommended Project Structure

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx          # Existing — add onboarding redirect gate
│   │   ├── dashboard/
│   │   │   └── page.tsx        # Existing — no change (gate is in layout)
│   │   └── profile/
│   │       └── page.tsx        # NEW: profile edit RSC page
│   └── (onboarding)/
│       └── onboarding/
│           └── page.tsx        # NEW: onboarding wizard RSC shell
├── components/
│   ├── onboarding/
│   │   └── onboarding-wizard.tsx  # NEW: 'use client' multi-step wizard
│   ├── profile/
│   │   └── profile-form.tsx       # NEW: 'use client' edit form
│   └── ui/
│       ├── textarea.tsx           # NEW: shadcn add
│       └── progress.tsx           # NEW: shadcn add
└── lib/
    ├── actions/
    │   └── profile.ts             # NEW: 'use server' Server Action
    ├── db/
    │   ├── schema.ts              # MODIFY: add profile columns
    │   └── queries.ts             # MODIFY: add findUserProfileByUserId()
    └── training/
        └── zones.ts               # NEW: pure Coggan zone utility
```

### Pattern 1: Drizzle Migration — Adding Nullable Columns

**What:** Add profile fields to `user_profiles` table with a new migration.
**When to use:** Any schema change after Phase 1 initial migration.

```typescript
// src/lib/db/schema.ts — add columns to userProfiles table
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()                         // Add .unique() — one profile per user
      .references(() => users.id, { onDelete: "cascade" }),
    // Phase 2 columns — all nullable (FTP/weight optional per PROF-01)
    ftp: integer("ftp"),               // watts, nullable
    weight: real("weight"),            // kg, nullable
    goals: text("goals"),              // free text, nullable
    injuries: text("injuries"),        // free text, nullable
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("user_profiles_user_id_idx").on(t.userId)]
);
```

Migration commands (run against DATABASE_URL_UNPOOLED):
```bash
DATABASE_URL_UNPOOLED=<direct-url> npx drizzle-kit generate
DATABASE_URL_UNPOOLED=<direct-url> npx drizzle-kit migrate
```

**Note:** `onboarding_complete` is `NOT NULL DEFAULT false` — this is safe to add to a table with existing rows because the default value satisfies the NOT NULL constraint on existing rows. [CITED: neon.com/docs/guides/drizzle-migrations]

### Pattern 2: Profile Upsert (onConflictDoUpdate)

**What:** Insert-or-update profile in a single query using the userId uniqueness constraint.
**Why not select-then-update:** Race condition window; upsert is atomic.

```typescript
// src/lib/actions/profile.ts
'use server'

import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { profileSchema } from '@/lib/db/schemas'

export async function saveProfileAction(_prevState: unknown, formData: FormData) {
  // Auth check — same pattern as auth route handlers
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect('/login')

  // Zod v4 parse — z.coerce.number() converts FormData strings to numbers
  const result = profileSchema.safeParse({
    goals:    formData.get('goals'),
    injuries: formData.get('injuries'),
    ftp:      formData.get('ftp') || undefined,
    weight:   formData.get('weight') || undefined,
  })
  if (!result.success) {
    return { errors: result.error.issues }   // result.error.issues, not .errors (Zod v4)
  }

  await db
    .insert(userProfiles)
    .values({
      userId: session.id,
      ...result.data,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,           // unique constraint on userId
      set: {
        ...result.data,
        onboardingComplete: true,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
```

[CITED: orm.drizzle.team/docs/guides/upsert]

### Pattern 3: Zod v4 Profile Schema with Optional Numbers

**What:** Validate profile form — goals/injuries required text, FTP/weight optional numbers.
**Key:** `z.coerce.number()` converts empty string from FormData to NaN, so we pass `undefined` for empty optional fields (see action above).

```typescript
// src/lib/db/schemas/profile.ts
import { z } from 'zod'

export const profileSchema = z.object({
  goals:    z.string().min(1, 'Please describe your training goals.').max(1000),
  injuries: z.string().max(1000).optional().default(''),
  ftp:      z.coerce.number().int().min(50).max(700).optional(),
  weight:   z.coerce.number().min(30).max(250).optional(),
})

export type ProfileInput = z.infer<typeof profileSchema>
```

Note: In Zod v4, `z.coerce.number()` input type is `unknown` (breaking change from v3 where it was typed as the source). `.optional()` still works as before. `error.issues` not `error.errors`. [CITED: zod.dev/v4/changelog]

### Pattern 4: useActionState for Profile Forms

**What:** Client form component with pending state, field errors, and progressive enhancement.

```typescript
// src/components/profile/profile-form.tsx
'use client'

import { useActionState } from 'react'        // React 19 — import from 'react'
import { useFormStatus } from 'react-dom'     // for SubmitButton child component
import { saveProfileAction } from '@/lib/actions/profile'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()          // must be child of <form>
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Saving…' : label}
    </button>
  )
}

export function ProfileForm({ existing }: { existing: ProfileInput | null }) {
  const [state, action] = useActionState(saveProfileAction, null)
  // state.errors contains Zod issue array on validation failure

  return (
    <form action={action}>
      {/* fields pre-populated from `existing` via defaultValue */}
      <SubmitButton label="Save profile" />
    </form>
  )
}
```

[CITED: nextjs.org/docs/app/getting-started/mutating-data]

### Pattern 5: Coggan Zone Utility

**What:** Pure TypeScript function — no dependencies, no DB calls. Takes FTP in watts, returns zone definition or null when FTP is absent.

```typescript
// src/lib/training/zones.ts

export type PowerZone = {
  zone: 1 | 2 | 3 | 4 | 5 | 6 | 7
  name: string
  label: string         // "Z1", "Z2", etc. — short label for Today view
  minWatts: number
  maxWatts: number | null  // null for Zone 7 (no upper bound)
  minPct: number        // % of FTP (lower bound, inclusive)
  maxPct: number | null // % of FTP (upper bound, inclusive; null = open)
}

// Coggan 7-zone model — FTP percentages
// Source: roadmancycling.com/blog/ftp-training-zones-cycling-complete-guide
const ZONE_DEFINITIONS = [
  { zone: 1, name: 'Active Recovery',      label: 'Z1', minPct: 0,    maxPct: 0.55  },
  { zone: 2, name: 'Endurance',            label: 'Z2', minPct: 0.56, maxPct: 0.75  },
  { zone: 3, name: 'Tempo',               label: 'Z3', minPct: 0.76, maxPct: 0.90  },
  { zone: 4, name: 'Threshold',           label: 'Z4', minPct: 0.91, maxPct: 1.05  },
  { zone: 5, name: 'VO2 Max',             label: 'Z5', minPct: 1.06, maxPct: 1.20  },
  { zone: 6, name: 'Anaerobic Capacity',  label: 'Z6', minPct: 1.21, maxPct: 1.50  },
  { zone: 7, name: 'Neuromuscular Power', label: 'Z7', minPct: 1.51, maxPct: null  },
] as const

/**
 * Returns all 7 power zones computed from FTP.
 * Returns null when ftp is null/undefined (RPE fallback path — PROF-03).
 */
export function computeZones(ftp: number | null | undefined): PowerZone[] | null {
  if (!ftp) return null
  return ZONE_DEFINITIONS.map(def => ({
    ...def,
    minWatts: Math.round(ftp * def.minPct),
    maxWatts: def.maxPct !== null ? Math.round(ftp * def.maxPct) : null,
  })) as PowerZone[]
}

/**
 * Returns the zone a given wattage falls into.
 * Returns null when ftp is absent (PROF-03 RPE path).
 */
export function getZoneForWatts(watts: number, ftp: number | null | undefined): PowerZone | null {
  const zones = computeZones(ftp)
  if (!zones) return null
  return zones.find(z => z.maxWatts === null || watts <= z.maxWatts) ?? zones[6]
}
```

[ASSUMED: Coggan zone boundary percentages taken from multiple cycling sources — these are widely accepted in the cycling community but the exact boundary at Zone 1/2 transition (55% vs 56%) varies by 1-2% across sources. The values above match Zwift, TrainingPeaks, and Strava implementations.]

### Pattern 6: Onboarding Redirect Gate in (app) Layout

**What:** RSC layout reads profile on every render; redirects unauthenticated to /login and unboarded to /onboarding.

```typescript
// src/app/(app)/layout.tsx — extend existing layout
import { findUserProfileByUserId } from '@/lib/db/queries'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect('/login')

  // Phase 2: gate on onboarding completion
  const profile = await findUserProfileByUserId(session.id)
  if (!profile || !profile.onboardingComplete) {
    redirect('/onboarding')
  }

  return <>{children}</>
}
```

Note: `/onboarding` must be in a separate route group (e.g., `(onboarding)`) that is NOT under `(app)`, otherwise the redirect creates a loop. The onboarding route must be added to `proxy.ts` as a protected (auth-required) path that is NOT gated by the onboarding check. [ASSUMED: route group separation approach — standard Next.js pattern]

### Pattern 7: findUserProfileByUserId Query Helper

**What:** New query helper needed — existing `findUserProfile(userId, profileId)` requires a known profileId which new users won't have.

```typescript
// src/lib/db/queries.ts — add:
export async function findUserProfileByUserId(userId: string) {
  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))  // userId is unique — no and() needed for single-user lookup
  return rows[0] ?? null
}
```

IDOR note: This query is safe because it only returns rows where `userId` matches the session userId passed by the caller. No per-resource ID to guard. The caller is always the authenticated user's own profile.

### Anti-Patterns to Avoid

- **URL-param step state for wizard:** Adds complexity (useSearchParams, URL encoding of form values), breaks back-button behavior unexpectedly, and provides no benefit for a 3-step onboarding flow. Use `useState` in the client component. [ASSUMED: based on common pattern analysis]
- **Wizard library (next-stepper, OnboardJS):** Adds unnecessary dependencies for a 3-step flow. Raw React state is simpler and more controllable.
- **Calling session.save() in a Server Action:** Per Phase 1 architecture contract, `session.save()` and `session.destroy()` live in Route Handlers only. Profile mutations don't modify the session, so this isn't needed here anyway.
- **Select-then-update for profile:** Race condition between the SELECT and UPDATE. Use the upsert (onConflictDoUpdate) pattern which is atomic.
- **NOT NULL columns without DEFAULT in migration:** If you add `onboarding_complete boolean NOT NULL` without `.default(false)` in the schema, the generated migration will fail on existing rows. Always add `.default(false)` in the schema definition for boolean fields on existing tables.
- **Chained .where().where() in Drizzle:** Phase 1 IDOR truth-condition — always use single `and()` call. `findUserProfileByUserId` is exempt because it only queries by `userId` (no secondary resource ID), but any query with two conditions must use `and(eq(...), eq(...))`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert (insert or update) | Custom select-then-update logic | `db.insert().onConflictDoUpdate()` | Atomic; handles race conditions; one DB round-trip |
| Form pending state | Manual `useState(isLoading)` | `useFormStatus` from `react-dom` | Built into React 19; works with Server Actions automatically |
| Server-side form errors | Manual error object passing | `useActionState(action, initialState)` returning error state | Built-in React 19 Server Action integration |
| Coggan zone lookup | Third-party zone library | Pure TypeScript function in `lib/training/zones.ts` | Zone model is 7 constants + arithmetic; no library needed |
| Profile schema validation | Custom type guards | Zod `z.coerce.number().optional()` | Handles FormData string-to-number coercion safely |

---

## Common Pitfalls

### Pitfall 1: Onboarding Loop
**What goes wrong:** `/onboarding` route is placed under `(app)` route group, which has the onboarding gate in its layout. The layout redirects unboarded users to `/onboarding` which triggers the layout again → infinite redirect loop.
**Why it happens:** Route group layouts apply to all routes within the group.
**How to avoid:** Place `/onboarding` under a separate `(onboarding)` route group with its own layout that only checks `session.id` (not `onboardingComplete`).
**Warning signs:** Vercel logs showing repeated redirect chains; browser "too many redirects" error.

### Pitfall 2: z.coerce.number() with Empty String
**What goes wrong:** `formData.get('ftp')` returns `''` (empty string) when the field is blank. `z.coerce.number().optional()` does NOT treat empty string as undefined — it coerces `''` to `NaN`, which fails the number validation even on an optional field.
**Why it happens:** Zod coercion converts the value, not the absent/present state.
**How to avoid:** In the Server Action, pass `formData.get('ftp') || undefined` before passing to Zod. This converts empty string to `undefined`, which Zod's `.optional()` correctly accepts.
**Warning signs:** Zod validation failure on FTP field even when left blank.

### Pitfall 3: userId Unique Constraint Missing on user_profiles
**What goes wrong:** The Phase 1 `user_profiles` table does NOT have `.unique()` on `userId`. Without this, `onConflictDoUpdate({ target: userProfiles.userId })` will throw a Postgres error because there's no unique constraint for the ON CONFLICT clause to target.
**Why it happens:** Phase 1 schema stub was intentionally minimal.
**How to avoid:** The Phase 2 migration MUST add `.unique()` to the `userId` column in `user_profiles`. This is a non-destructive constraint addition (Postgres can add a unique constraint to an existing column with `ALTER TABLE user_profiles ADD CONSTRAINT ... UNIQUE (user_id)`). Drizzle-kit generates this automatically when `.unique()` is added to the schema column.
**Warning signs:** `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification` at runtime.

### Pitfall 4: NOT NULL Column Without Default on Existing Table
**What goes wrong:** `onboarding_complete boolean NOT NULL` generates `ALTER TABLE ADD COLUMN onboarding_complete boolean NOT NULL` without a default. If there are any existing rows, this fails.
**Why it happens:** drizzle-kit generates the DDL but does not know if existing rows are present.
**How to avoid:** Define as `.default(false)` in schema — drizzle-kit will include `DEFAULT false` in the generated SQL. For the Vercel production DB (which has existing user rows from Phase 1), the migration succeeds.
**Warning signs:** Migration fails with `ERROR: column "onboarding_complete" of relation "user_profiles" contains null values`.

### Pitfall 5: revalidatePath Before redirect
**What goes wrong:** Calling `redirect('/dashboard')` before `revalidatePath('/dashboard')` — the cache isn't cleared, so the dashboard still shows stale data after the redirect.
**Why it happens:** `redirect()` throws a Next.js control-flow exception; code after it does not execute.
**How to avoid:** Always call `revalidatePath()` before `redirect()` in Server Actions.

### Pitfall 6: Wizard State Lost on Tab Switch / Accidental Navigation
**What goes wrong:** User navigates away mid-wizard, returns, and finds a blank step 1.
**Why it happens:** Client-side `useState` is not persisted between navigations.
**How to avoid:** For a 3-step wizard where each step takes ~30 seconds, this is acceptable. Do not implement `localStorage` persistence for v1 — out of scope (keeps wizard code simple). If the user navigates away, they restart from step 1. This is standard behavior for auth/onboarding flows.

---

## Runtime State Inventory

This is not a rename/refactor phase. Omit.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 (min 20.9) | ✓ | v25.9.0 | — |
| npm | Package management | ✓ | 11.12.1 | — |
| DATABASE_URL_UNPOOLED | drizzle-kit migrate | ✓ (set on Vercel; must be set locally for migration dev) | — | — |

**Missing dependencies with no fallback:** None.

**Note on migration environment:** `DATABASE_URL_UNPOOLED` must be set locally to run `drizzle-kit generate` and `drizzle-kit migrate` during development. On Vercel, migrations run at deploy time via the same env var injected by Neon Marketplace. This is identical to Phase 1 — no new infrastructure needed.

---

## Validation Architecture

nyquist_validation is enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.8 |
| Config file | `vitest.config.ts` (exists at project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROF-01 | Onboarding wizard saves all fields (goals, injuries, optional FTP/weight) | unit | `npx vitest run tests/profile.test.ts` | ❌ Wave 0 |
| PROF-01 | Schema: user_profiles has ftp, weight, goals, injuries, onboarding_complete columns | unit | `npx vitest run tests/schema.test.ts` | ✅ (extend) |
| PROF-02 | Profile upsert updates existing row without creating duplicate | unit | `npx vitest run tests/profile.test.ts` | ❌ Wave 0 |
| PROF-03 | computeZones(null) returns null; computeZones(200) returns 7 zones with correct watt bounds | unit | `npx vitest run tests/zones.test.ts` | ❌ Wave 0 |
| PROF-03 | getZoneForWatts(150, 200) returns Z4 (150 = 75% of 200 → Z2 Endurance; actually 150/200=0.75 → Z2) | unit | `npx vitest run tests/zones.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/zones.test.ts tests/profile.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/profile.test.ts` — covers PROF-01 (schema columns added) and PROF-02 (upsert creates/updates)
- [ ] `tests/zones.test.ts` — covers PROF-03 (null FTP → null, zone boundary math)
- [ ] Extend `tests/schema.test.ts` — assert new columns exist on `user_profiles`

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | All profile mutations verify session via getIronSession before executing |
| V3 Session Management | no | No session changes in this phase |
| V4 Access Control | yes | Server Action reads `session.id` as the authoritative userId; never trust client-submitted userId |
| V5 Input Validation | yes | Zod v4 schema on all profile fields; max lengths on text fields (goals max 1000 chars) |
| V6 Cryptography | no | No new cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-submitted userId override | Tampering (IDOR) | Server Action reads userId from iron-session cookie only; form fields never include userId |
| Oversized text fields (goals/injuries) | Denial of Service | Zod `.max(1000)` on text fields; Postgres `text` has no inherent limit but Zod enforces it |
| Unauthenticated profile write | Elevation of Privilege | `if (!session.id) redirect('/login')` at top of Server Action |
| Missing wizard redirect bypass | Broken Access Control | Dashboard layout redirects unboarded users; onboarding route in separate non-gated route group |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useFormState` (React 18) | `useActionState` from `react` (React 19) | React 19 (ships with Next.js 16) | Same API, renamed; import path changed |
| `revalidatePath` before redirect | Same — still required | Next.js 14+ | redirect() throws; code after it won't run |

**Deprecated/outdated:**
- `useFormState` from `react-dom`: replaced by `useActionState` from `react` in React 19. Do not use `useFormState`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Coggan Z1/Z2 boundary at 55%/56% FTP | Code Examples (Pattern 5) | Zone 2 lower bound could be argued as 55% — 1W difference at 200W FTP; negligible training impact |
| A2 | Route group separation (onboarding) vs (app) for redirect loop prevention | Architecture Patterns (Pitfall 1) | Standard Next.js pattern; very low risk |
| A3 | Client-side useState wizard (no URL params) | Architecture Patterns (Anti-Patterns) | If deeper requirements emerge (sharable step links, resume on back-nav), URL params would be needed — not required by PROF-01 |

---

## Open Questions

1. **Wizard step count and fields**
   - What we know: PROF-01 requires goals, injury notes, FTP (optional), weight (optional)
   - Proposed split: Step 1 = Goals (required text), Step 2 = Injuries / Health notes (optional text), Step 3 = FTP + Weight (both optional)
   - What's unclear: Whether to combine Steps 2+3 into a single step
   - Recommendation: Keep 3 steps — cleaner UX; each screen has a clear intent

2. **Profile edit page location**
   - What we know: Must be accessible after onboarding (PROF-02)
   - Proposed: `/profile` under `(app)` route group
   - What's unclear: Whether a nav link from dashboard is in scope for this phase
   - Recommendation: Implement the edit page; add a simple nav link from dashboard in this phase (needed to test PROF-02)

---

## Sources

### Primary (MEDIUM confidence — verified via official docs)
- [nextjs.org/docs/app/getting-started/mutating-data](https://nextjs.org/docs/app/getting-started/mutating-data) — Server Actions, useActionState, redirect, revalidatePath
- [orm.drizzle.team/docs/guides/upsert](https://orm.drizzle.team/docs/guides/upsert) — onConflictDoUpdate syntax
- [neon.com/docs/guides/drizzle-migrations](https://neon.com/docs/guides/drizzle-migrations) — migration workflow, non-pooled connection requirement
- [zod.dev/v4/changelog](https://zod.dev/v4/changelog) — z.coerce input type change, .optional() behavior

### Secondary (MEDIUM confidence — community verified against official patterns)
- [robinwieruch.de/next-forms](https://www.robinwieruch.de/next-forms/) — useActionState pattern, useFormStatus child component constraint, fromErrorToFormState utility
- [roadmancycling.com/blog/ftp-training-zones-cycling-complete-guide](https://roadmancycling.com/blog/ftp-training-zones-cycling-complete-guide) — Coggan 7-zone percentages

### Tertiary (LOW confidence — cross-referenced)
- [WebSearch: Coggan zones] — Zone boundary values consistent across 4+ sources; elevated to MEDIUM for zone boundaries

---

## Metadata

**Confidence breakdown:**
- Schema migration: MEDIUM — Drizzle migration workflow verified via official Neon + Drizzle docs
- Server Actions: MEDIUM — Next.js 16 official docs fetched directly
- Coggan zones: MEDIUM — zone percentages consistent across Strava, Zwift, TrainingPeaks documentation and cycling community sources
- Wizard pattern: MEDIUM — standard React useState multi-step pattern; no deep unknown

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable stack; Drizzle and Next.js APIs unlikely to change in 30 days)
