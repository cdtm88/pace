'use server'

/**
 * deleteUploadAction — Server Action for deleting an activity upload (UPLOAD-03).
 *
 * Security contract:
 *   - userId is ALWAYS read from the iron-session cookie; NEVER from function arguments
 *     or any client-supplied input (IDOR guard — same contract as profile.ts).
 *   - IDOR protection lives in deleteActivityUpload: the helper uses and(eq(userId), eq(id))
 *     in a single call so a cross-user delete returns an empty array (Pitfall 4 / T-05-07).
 *   - A zero-row delete (uploadId not found or not owned by this user) returns
 *     { error: 'not_found' } — we do NOT distinguish between "not found" and "not yours"
 *     (D-09 anti-enumeration: existence of a resource is never revealed to an unauthorized caller).
 *
 * Ordering (matches saveProfileAction pattern in profile.ts):
 *   1. Auth gate
 *   2. Validate uploadId (non-empty string guard)
 *   3. Delete via IDOR-safe helper
 *   4. revalidatePath('/dashboard') so the TSS chart and upload list re-render
 *   5. Return { ok: true } on success (action is called via transition, not redirect)
 *
 * References: UPLOAD-03, D-04, D-09, T-05-07
 */
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { deleteActivityUpload } from '@/lib/db/queries';
import { revalidatePath } from 'next/cache';

export async function deleteUploadAction(
  uploadId: string
): Promise<{ ok: true } | { error: string }> {
  // 1. Auth gate — userId from session only; never from function arguments (T-05-07 / IDOR)
  //    await cookies() is mandatory in Next.js 16 (CLAUDE.md constraint)
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.id) {
    return { error: 'Not authenticated' };
  }

  // 2. Validate uploadId is a non-empty string
  if (!uploadId || typeof uploadId !== 'string') {
    return { error: 'invalid_upload_id' };
  }

  // 3. Delete via IDOR-safe helper (single and() call — Pitfall 4 / T-05-07)
  //    The helper returns the deleted rows; an empty array means cross-user or not-found
  const removed = await deleteActivityUpload(session.id, uploadId);

  if (removed.length === 0) {
    // D-09: do NOT distinguish between not-found and not-yours; anti-enumeration
    return { error: 'not_found' };
  }

  // 4. Revalidate BEFORE returning — matches saveProfileAction's revalidate-before-redirect
  //    ordering (Pitfall 5 in profile.ts, adapted for action-not-redirect context)
  revalidatePath('/dashboard');

  // 5. Return success
  return { ok: true };
}
