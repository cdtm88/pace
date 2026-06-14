/**
 * IDOR-safe user-scoped query helpers (D-03 truth-condition).
 *
 * IDOR guard: and() is mandatory here — do not split into chained .where() calls.
 * Drizzle silently drops the first .where() when chained — IDOR vulnerability (Pitfall 1).
 * Pattern: .where(and(eq(table.userId, userId), eq(table.id, id)))
 *
 * All helpers return null on no-match. Callers must call notFound() on null — returns
 * 404, never 403 (D-09: existence of a resource is never revealed to an unauthorized requester).
 *
 * See: CONTEXT.md D-03, D-09; RESEARCH.md Pattern 2, Pitfall 1
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  trainingSessions,
  userProfiles,
  stravaConnections,
} from "@/lib/db/schema";

// ── Training Sessions ─────────────────────────────────────────────────────────

/**
 * Fetch a single training session scoped to the authenticated user.
 *
 * IDOR guard: and() is mandatory here — do not split into chained .where() calls.
 * Returns null when no row matches OR when the row belongs to a different user.
 * Caller must call notFound() on null — 404 not 403 (D-09).
 */
export async function findTrainingSession(
  userId: string,
  sessionId: string
) {
  // IDOR guard: and() is mandatory here — do not split into chained .where() calls.
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

/**
 * List all training sessions for the authenticated user.
 *
 * IDOR guard: and() is mandatory here — do not split into chained .where() calls.
 * Only the single userId eq() is needed for a list query (no per-resource id check).
 */
export async function listTrainingSessions(userId: string) {
  return db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.userId, userId));
}

// ── User Profiles ─────────────────────────────────────────────────────────────

/**
 * Fetch the user's profile record scoped to their userId.
 *
 * IDOR guard: and() is mandatory here — do not split into chained .where() calls.
 * Returns null when no profile exists or profile belongs to a different user.
 */
export async function findUserProfile(userId: string, profileId: string) {
  // IDOR guard: and() is mandatory here — do not split into chained .where() calls.
  const rows = await db
    .select()
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.id, profileId)
      )
    );
  return rows[0] ?? null;
}

// ── Strava Connections ────────────────────────────────────────────────────────

/**
 * Fetch the Strava connection scoped to the authenticated user.
 *
 * IDOR guard: and() is mandatory here — do not split into chained .where() calls.
 * Returns null when no connection exists or belongs to a different user.
 */
export async function findStravaConnection(
  userId: string,
  connectionId: string
) {
  // IDOR guard: and() is mandatory here — do not split into chained .where() calls.
  const rows = await db
    .select()
    .from(stravaConnections)
    .where(
      and(
        eq(stravaConnections.userId, userId),
        eq(stravaConnections.id, connectionId)
      )
    );
  return rows[0] ?? null;
}
