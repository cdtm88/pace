/**
 * Activity-to-session matching — pure function (D-10).
 *
 * Match algorithm (D-10, RESEARCH anti-pattern note):
 *   1. Compare UTC calendar date strings: startedAt vs createdAt via .toISOString().slice(0, 10)
 *      (timezone-safe — avoids local timezone boundary issues)
 *   2. For same-day candidates: compute ratio = fit.durationSec / session.totalDurationSec
 *      Accept if ratio is in [0.8, 1.2] (±20% tolerance)
 *   3. Return {id, title} of the first matching session, or null if none match
 *
 * D-05: The match is owned by activity_uploads.matchedSessionId.
 *       No back-reference column on training_sessions — this function owns the
 *       matching logic and the Route Handler writes the result to activity_uploads.
 *
 * D-06: One upload per session is a soft constraint (last upload wins).
 *       This function does not enforce uniqueness — that is the caller's concern.
 */

/** Fields extracted from a parsed .fit file (D-08). */
export interface FitSession {
  /** UTC start time of the ride, from the FIT session message start_time */
  startedAt: Date;
  /** Total elapsed time in seconds, from the FIT session message total_elapsed_time */
  durationSec: number;
}

/** A planned training session that can be matched against an uploaded ride. */
export interface MatchableSession {
  id: string;
  title: string;
  /** When the session was generated — used as the "session date" for matching */
  createdAt: Date;
  /** Planned session total duration in seconds (training_sessions.total_duration_sec) */
  totalDurationSec: number;
}

/**
 * Find the planned session that best matches a completed ride.
 *
 * @param fit      - Fields extracted from the uploaded .fit file
 * @param sessions - The authenticated user's planned sessions to search
 * @returns        - {id, title} of the first matching session, or null
 */
export function matchActivity(
  fit: FitSession,
  sessions: MatchableSession[]
): { id: string; title: string } | null {
  const fitDay = fit.startedAt.toISOString().slice(0, 10);

  for (const s of sessions) {
    const sessionDay = s.createdAt.toISOString().slice(0, 10);
    if (sessionDay !== fitDay) continue;

    const ratio = fit.durationSec / s.totalDurationSec;
    if (ratio >= 0.8 && ratio <= 1.2) {
      return { id: s.id, title: s.title };
    }
  }

  return null;
}
