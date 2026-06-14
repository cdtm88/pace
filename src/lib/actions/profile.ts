'use server'

/**
 * saveProfileAction — Server Action for onboarding wizard and profile edit.
 *
 * Security contract (T-02-01, T-02-04):
 *   - userId is ALWAYS read from the iron-session cookie; never from FormData.
 *   - Unauthenticated callers are redirected to /login before any DB write.
 *
 * FormData pitfall (Pitfall 2 — Zod v4 z.coerce.number()):
 *   - ftp/weight are passed as `formData.get('ftp') || undefined`.
 *   - This converts empty string → undefined, which .optional() accepts.
 *   - Without this, "" coerces to NaN and fails the number check.
 *
 * Redirect ordering (Pitfall 5):
 *   - revalidatePath('/dashboard') MUST be called BEFORE redirect('/dashboard').
 *   - redirect() throws a NEXT_REDIRECT error; code after it is unreachable.
 */
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { db } from '@/lib/db/index'
import { userProfiles } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { profileSchema } from '@/lib/db/schemas/profile'

export async function saveProfileAction(_prevState: unknown, formData: FormData) {
  // 1. Auth gate — userId from session only, never from FormData (T-02-01, T-02-04)
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.id) redirect('/login')

  // 2. Validate — empty string → undefined for optional numeric fields (Pitfall 2)
  const result = profileSchema.safeParse({
    goals:    formData.get('goals'),
    injuries: formData.get('injuries'),
    ftp:      formData.get('ftp') || undefined,
    weight:   formData.get('weight') || undefined,
  })
  if (!result.success) {
    return { errors: result.error.issues }   // .issues not .errors — Zod v4 (CLAUDE.md)
  }

  // 3. Upsert profile — onConflictDoUpdate on userId unique constraint (T-02-03)
  await db
    .insert(userProfiles)
    .values({
      userId: session.id,
      ...result.data,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...result.data, onboardingComplete: true, updatedAt: new Date() },
    })

  // 4. Revalidate BEFORE redirect — redirect() throws, code after it is unreachable (Pitfall 5)
  revalidatePath('/dashboard')
  redirect('/dashboard')
}
