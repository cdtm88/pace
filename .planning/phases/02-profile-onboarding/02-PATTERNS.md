# Phase 2: Profile & Onboarding — Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 11 new/modified files
**Analogs found:** 10 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` | model | CRUD | `src/lib/db/schema.ts` (itself — modify) | exact |
| `src/lib/db/queries.ts` | model | request-response | `src/lib/db/queries.ts` (itself — extend) | exact |
| `src/lib/actions/profile.ts` | service | request-response | `src/app/api/auth/login/route.ts` | role-match (server mutation, session auth, Zod parse) |
| `src/lib/db/schemas/profile.ts` | utility | transform | `src/lib/auth/schemas.ts` | exact |
| `src/lib/training/zones.ts` | utility | transform | none — pure function, no analog | no analog |
| `src/lib/copy.ts` | config | — | `src/lib/copy.ts` (itself — extend) | exact |
| `src/app/(onboarding)/onboarding/page.tsx` | route/RSC | request-response | `src/app/(auth)/login/page.tsx` | role-match (RSC shell wrapping client component) |
| `src/app/(app)/layout.tsx` | middleware/RSC | request-response | `src/app/(app)/layout.tsx` (itself — modify) | exact |
| `src/app/(app)/profile/page.tsx` | route/RSC | request-response | `src/app/(app)/dashboard/page.tsx` | role-match |
| `src/app/(app)/dashboard/page.tsx` | route/RSC | request-response | `src/app/(app)/dashboard/page.tsx` (itself — modify) | exact |
| `src/components/onboarding/onboarding-wizard.tsx` | component | event-driven | `src/components/auth/login-form.tsx` | role-match |
| `src/components/profile/profile-form.tsx` | component | request-response | `src/components/auth/login-form.tsx` | role-match |

---

## Pattern Assignments

### `src/lib/db/schema.ts` (model — modify)

**Analog:** itself

**Existing import block** (lines 1–16):
```typescript
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
```
Add to this import: `integer, real, boolean`

**Existing table pattern to extend** (lines 31–43):
```typescript
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("user_profiles_user_id_idx").on(t.userId)]
);
```

**What to add:** `.unique()` on `userId`, plus new columns before `createdAt`:
```typescript
userId: uuid("user_id")
  .notNull()
  .unique()                          // ADD — required for onConflictDoUpdate
  .references(() => users.id, { onDelete: "cascade" }),
ftp: integer("ftp"),                 // nullable by default (no .notNull())
weight: real("weight"),
goals: text("goals"),
injuries: text("injuries"),
onboardingComplete: boolean("onboarding_complete").notNull().default(false),
```

**Analog pattern for unique + FK** (line 75 — stravaConnections):
```typescript
userId: uuid("user_id")
  .notNull()
  .unique()
  .references(() => users.id, { onDelete: "cascade" }),
```

---

### `src/lib/db/queries.ts` (model — extend)

**Analog:** itself

**Existing query pattern to copy exactly** (lines 30–45):
```typescript
export async function findTrainingSession(userId: string, sessionId: string) {
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

**New function to add** — `findUserProfileByUserId` (userId-only lookup, no secondary ID):
```typescript
export async function findUserProfileByUserId(userId: string) {
  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
  return rows[0] ?? null;
}
```

Note: Single `eq()` is sufficient here because `userId` IS the resource identifier (one profile per user). The IDOR `and()` rule applies when a secondary resource `id` is also being filtered.

---

### `src/lib/db/schemas/profile.ts` (utility — new)

**Analog:** `src/lib/auth/schemas.ts`

**Imports pattern** (lines 1–10 of analog):
```typescript
import { z } from "zod";
```

**Zod v4 field pattern** (lines 17–22 of analog):
```typescript
// Zod v4: z.email() not z.string().email()
// result.error.issues not result.error.errors
export const loginSchema = z.object({
  email: z.email({ message: "Please enter a valid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});
export type LoginInput = z.infer<typeof loginSchema>;
```

**Profile schema to build** (following same pattern):
```typescript
import { z } from "zod";

export const profileSchema = z.object({
  goals:    z.string().min(1, "Describe your training goals to continue.").max(1000),
  injuries: z.string().max(1000).optional().default(""),
  ftp:      z.coerce.number().int().min(50).max(700).optional(),
  weight:   z.coerce.number().min(30).max(250).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
```

**Zod v4 critical note:** `z.coerce.number()` coerces `""` to `NaN` — pass `formData.get('ftp') || undefined` before parsing (see Server Action pattern below).

---

### `src/lib/actions/profile.ts` (service — new)

**Analog:** `src/app/api/auth/login/route.ts`

**Session auth pattern** (lines 106–112 of analog):
```typescript
const session = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);
// For Server Actions: if (!session.id) redirect('/login')
// NOT session.save() — that only lives in Route Handlers
```

**Zod parse + error return pattern** (lines 59–65 of analog):
```typescript
const result = loginSchema.safeParse(body);
if (!result.success) {
  return NextResponse.json(
    { error: firstIssueMessage(result) },
    { status: 400 }
  );
}
```
In a Server Action, return `{ errors: result.error.issues }` instead of NextResponse.

**Full Server Action structure:**
```typescript
'use server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { profileSchema } from '@/lib/db/schemas/profile'

export async function saveProfileAction(_prevState: unknown, formData: FormData) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect('/login')

  const result = profileSchema.safeParse({
    goals:    formData.get('goals'),
    injuries: formData.get('injuries'),
    ftp:      formData.get('ftp') || undefined,      // empty string → undefined for Zod .optional()
    weight:   formData.get('weight') || undefined,
  })
  if (!result.success) {
    return { errors: result.error.issues }           // .issues not .errors (Zod v4)
  }

  await db
    .insert(userProfiles)
    .values({ userId: session.id, ...result.data, onboardingComplete: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...result.data, onboardingComplete: true, updatedAt: new Date() },
    })

  revalidatePath('/dashboard')    // BEFORE redirect — redirect() throws, code after it won't run
  redirect('/dashboard')
}
```

---

### `src/lib/training/zones.ts` (utility — new, no analog)

No existing analog — pure function with zero dependencies. See RESEARCH.md Pattern 5 for the full implementation. No codebase pattern to copy from; implement from the RESEARCH.md code example directly.

---

### `src/lib/copy.ts` (config — extend)

**Analog:** itself

**Existing pattern** (lines 13–43):
```typescript
export const COPY = {
  LOGIN_HEADING: "Sign in to Pace",
  // ...
} as const;
```

Extend the same `COPY` object with Phase 2 keys from UI-SPEC §Copywriting Contract. All new keys go inside the existing `const COPY = { ... } as const` object.

---

### `src/app/(app)/layout.tsx` (middleware/RSC — modify)

**Analog:** itself

**Existing session check pattern** (lines 25–33):
```typescript
const session = await getIronSession<SessionData>(
  await cookies(),
  sessionOptions
);
if (!session.id) {
  redirect("/login");
}
```

**Add after the session check:**
```typescript
import { findUserProfileByUserId } from "@/lib/db/queries";

// After existing session.id check:
const profile = await findUserProfileByUserId(session.id)
if (!profile || !profile.onboardingComplete) {
  redirect("/onboarding")
}
```

**Critical:** `/onboarding` MUST be in `(onboarding)` route group, NOT under `(app)`. Otherwise this redirect creates an infinite loop.

---

### `src/app/(onboarding)/onboarding/page.tsx` (route/RSC — new)

**Analog:** `src/app/(auth)/login/page.tsx`

The auth login page is an RSC shell that reads server-side data and renders a client component. Pattern: minimal RSC that checks session (auth only, not onboarding gate), then renders the client wizard.

**Session-only check pattern** (from `src/app/(app)/layout.tsx` lines 25–33):
```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export default async function OnboardingPage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect("/login")
  // Do NOT check onboardingComplete here — this is the onboarding page itself
  return <OnboardingWizard />
}
```

---

### `src/app/(app)/profile/page.tsx` (route/RSC — new)

**Analog:** `src/app/(app)/dashboard/page.tsx`

**RSC pattern with session + data fetch** (lines 16–26 of analog):
```typescript
export default async function DashboardPage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) { redirect("/login") }
  // ...
}
```

For profile page, additionally fetch existing profile to pre-populate the form:
```typescript
export default async function ProfilePage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect("/login")
  const profile = await findUserProfileByUserId(session.id)
  return (
    <main ...>
      <ProfileForm existing={profile} />
    </main>
  )
}
```

**Layout structure from dashboard** (lines 28–49 of analog):
```typescript
<main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
  <div className="w-full max-w-sm space-y-6">
```
Use `max-w-lg` instead of `max-w-sm` for profile/wizard pages (UI-SPEC §Spacing).

---

### `src/app/(app)/dashboard/page.tsx` (route/RSC — modify)

**Analog:** itself

Existing page fetches session and renders stub. Phase 2 adds: profile fetch, FTP status display, "Edit profile" link. Extend the existing `space-y-6` div with new elements following the same `text-sm text-muted-foreground` pattern already used on line 32.

---

### `src/components/onboarding/onboarding-wizard.tsx` (component — new)

**Analog:** `src/components/auth/login-form.tsx`

**Client component declaration + imports** (lines 1–31 of analog):
```typescript
"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { COPY } from "@/lib/copy";
```
Add for wizard: `Textarea`, `Progress` from `@/components/ui/`, `useActionState` from `react`, `useFormStatus` from `react-dom`.

**useState field state pattern** (lines 40–45 of analog):
```typescript
const [email, setEmail] = useState("");
const [isLoading, setIsLoading] = useState(false);
const [pageError, setPageError] = useState<string | null>(null);
const [emailError, setEmailError] = useState<string | null>(null);
```
For wizard: replace with `useState({ step: 1, goals: "", injuries: "", ftp: "", weight: "" })`.

**Loading button pattern** (lines 161–175 of analog):
```typescript
<Button
  type="submit"
  disabled={isLoading}
  aria-busy={isLoading}
  className="h-12 w-full text-base font-medium"
>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {COPY.LOGIN_CTA_LOADING}
    </>
  ) : (
    COPY.LOGIN_CTA
  )}
</Button>
```

**Field with error pattern** (lines 107–131 of analog):
```typescript
<div className="space-y-2">
  <Label htmlFor="email" className="text-base font-medium text-foreground">
    Email
  </Label>
  <Input
    id="email"
    aria-describedby={emailError ? "email-error" : undefined}
    aria-invalid={!!emailError}
    className="h-12 text-base"
  />
  {emailError && (
    <p id="email-error" className="text-sm text-destructive">
      {emailError}
    </p>
  )}
</div>
```
For textarea fields: replace `<Input>` with `<Textarea>`, remove `h-12`, add `min-h-[120px]` (goals) or `min-h-[100px]` (injuries). Keep `text-base` (iOS auto-zoom requirement).

**Form wrapping** (line 98 of analog):
```typescript
<form onSubmit={handleSubmit} noValidate className="space-y-6">
```
Step 3 submit uses `useActionState`: `const [state, formAction] = useActionState(saveProfileAction, null)` then `<form action={formAction}>`.

**Back button — type="button" to prevent form submit:**
```typescript
<Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
  {COPY.ONBOARDING_CTA_BACK}
</Button>
```

**Card layout from auth-card.tsx** (lines 22–37 of analog):
```typescript
<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
  <p className="mb-6 text-[28px] font-bold leading-[1.1] tracking-tight text-foreground">
    {COPY.WORDMARK}
  </p>
  <Card className="w-full max-w-lg bg-card">   {/* max-w-lg not max-w-sm for wizard */}
    <CardContent className="p-8">
      {/* wizard step content */}
    </CardContent>
  </Card>
</div>
```

---

### `src/components/profile/profile-form.tsx` (component — new)

**Analog:** `src/components/auth/login-form.tsx`

Same client component pattern as wizard, but simpler: single-step form, all 4 fields, pre-populated via `defaultValue`. Uses `useActionState` (not manual fetch):

```typescript
"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfileAction } from "@/lib/actions/profile";

function SubmitButton() {
  const { pending } = useFormStatus();         // must be a child of <form>
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}
      className="h-12 w-full text-base font-medium">
      {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{COPY.PROFILE_CTA_LOADING}</> : COPY.PROFILE_CTA_SAVE}
    </Button>
  );
}

export function ProfileForm({ existing }: { existing: ProfileInput | null }) {
  const [state, formAction] = useActionState(saveProfileAction, null);
  return (
    <form action={formAction} className="space-y-6">
      {state?.errors && <ErrorBanner message={COPY.AUTH_ERROR_SERVER} />}
      {/* fields with defaultValue={existing?.goals ?? ""} etc. */}
      <SubmitButton />
    </form>
  );
}
```

Key difference from login-form: uses `useActionState` + `<form action={formAction}>` (progressive enhancement) instead of `fetch()`. `useFormStatus` provides pending state inside a child component — it cannot be used in the same component as the `<form>`.

---

## Shared Patterns

### Session auth in all server-side code
**Source:** `src/lib/session.ts` + `src/app/api/auth/login/route.ts` (lines 106–112)
**Apply to:** `src/lib/actions/profile.ts`, `src/app/(app)/layout.tsx`, `src/app/(onboarding)/onboarding/page.tsx`, `src/app/(app)/profile/page.tsx`
```typescript
const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
if (!session.id) redirect('/login')   // Server Actions use redirect(); Route Handlers use NextResponse
```

### Async cookies/headers (Next.js 16 hard requirement)
**Source:** `src/app/(app)/layout.tsx` (line 25), `src/app/api/auth/login/route.ts` (line 43)
**Apply to:** Every server-side file that calls `cookies()` or `headers()`
```typescript
await cookies()     // NOT cookies() — must await in Next.js 16
await headers()
```

### Zod v4 parse + issue extraction
**Source:** `src/lib/auth/schemas.ts` (lines 49–53)
**Apply to:** `src/lib/actions/profile.ts`, `src/lib/db/schemas/profile.ts`
```typescript
// result.error.issues (NOT .errors — Zod v4 breaking change)
return result.error.issues[0]?.message ?? "Invalid input."
// In Server Actions, return { errors: result.error.issues }
```

### Error display — inline field errors
**Source:** `src/components/auth/login-form.tsx` (lines 127–130)
**Apply to:** `src/components/onboarding/onboarding-wizard.tsx`, `src/components/profile/profile-form.tsx`
```typescript
{fieldError && (
  <p id="field-error" className="text-sm text-destructive">
    {fieldError}
  </p>
)}
// Input carries: aria-describedby="field-error" aria-invalid={!!fieldError}
```

### Page-level error display
**Source:** `src/components/auth/login-form.tsx` (line 105)
**Apply to:** Wizard step 3, ProfileForm
```typescript
{pageError && <ErrorBanner message={pageError} />}
```

### Form field wrapper spacing
**Source:** `src/components/auth/login-form.tsx` (lines 107–131)
**Apply to:** All form components
```typescript
<div className="space-y-2">    {/* between label and input */}
  <Label htmlFor="x" className="text-base font-medium text-foreground">
  <Input className="h-12 text-base" />  {/* h-12 for inputs; text-base for iOS auto-zoom */}
</div>
// Group of fields: <div className="space-y-4">
// Form root: <form className="space-y-6">
```

### Typography roles
**Source:** `src/components/auth/login-form.tsx` + `src/components/auth/auth-card.tsx`
**Apply to:** All new components and pages
```
Heading (h1):    text-2xl font-semibold leading-[1.2] text-foreground
Body:            text-sm text-muted-foreground
Label:           text-base font-medium text-foreground
Wordmark:        text-[28px] font-bold leading-[1.1] tracking-tight text-foreground
Muted/hint:      text-sm text-muted-foreground font-normal
```

### IDOR-safe query pattern
**Source:** `src/lib/db/queries.ts` (lines 30–45)
**Apply to:** `src/lib/db/queries.ts` (new `findUserProfileByUserId`)
```typescript
// Two-condition queries: and() mandatory — never chain .where().where()
.where(and(eq(table.userId, userId), eq(table.id, resourceId)))
// Single userId lookup (no secondary ID): single eq() is correct
.where(eq(userProfiles.userId, userId))
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/training/zones.ts` | utility | transform | Pure math function — no similar utility exists; implement from RESEARCH.md Pattern 5 |
| `src/components/ui/textarea.tsx` | component | — | Install via `npx shadcn@latest add textarea`; do not hand-roll |
| `src/components/ui/progress.tsx` | component | — | Install via `npx shadcn@latest add progress`; do not hand-roll |

---

## Metadata

**Analog search scope:** `src/app/`, `src/components/`, `src/lib/`
**Files scanned:** 27
**Pattern extraction date:** 2026-06-14
