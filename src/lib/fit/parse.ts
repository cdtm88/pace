/**
 * FIT file parser wrapper (D-07, D-08, D-09).
 *
 * Uses fit-file-parser v3 with mode:'list' (NOT 'cascade') so session messages
 * are available at data.sessions?.[0] directly on the top-level result object.
 * Pitfall 2 (RESEARCH): mode:'cascade' nests sessions under activities — do not
 * switch to cascade without updating the accessor path.
 *
 * force:true tolerates minor FIT file corruption without throwing; however,
 * if no sessions message is present in the result, we still throw — the caller
 * returns 400 invalid_fit_file (D-09).
 *
 * D-07: Library: fit-file-parser; force: true; mode: 'list'
 * D-08: Extracted fields: startedAt (Date), durationSec (number), avgPowerW (number|null)
 * D-09: Throw on invalid FIT binary or missing session message → caller returns 400
 *
 * IMPORTANT: This module is Node-only (Buffer dependency). Never export from
 * an Edge Runtime route — do NOT add `export const runtime = 'edge'` here or in
 * any route that imports this file (RESEARCH anti-pattern).
 */
import FitParser from 'fit-file-parser';

export interface FitSession {
  /** UTC start time of the ride, from the FIT session message start_time */
  startedAt: Date;
  /** Total elapsed time in seconds, from the FIT session message total_elapsed_time */
  durationSec: number;
  /**
   * Average power in watts from the FIT session message avg_power.
   * null when the device did not record power (Pitfall 3 — undefined → null, never 0).
   */
  avgPowerW: number | null;
}

/**
 * Parse a .fit file buffer and extract session-level metrics.
 *
 * @param buffer - Raw .fit file bytes (Node Buffer)
 * @returns      - FitSession with startedAt, durationSec, avgPowerW
 * @throws       - When buffer is not a valid FIT file, or when no session message is present
 */
export async function parseFitFile(buffer: Buffer): Promise<FitSession> {
  // mode:'list' — session messages appear at data.sessions[0] (top-level)
  // force:true  — tolerate minor file corruption without immediate throw
  const parser = new FitParser({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: false,
    mode: 'list',
  });

  // parseAsync throws for genuinely invalid binaries (no FIT magic header etc.)
  const data = await parser.parseAsync(buffer);

  const session = data.sessions?.[0];
  if (!session) {
    throw new Error('No session message found in FIT file');
  }

  return {
    startedAt: new Date(session.start_time),
    durationSec: Math.round(session.total_elapsed_time ?? 0),
    // Pitfall 3: undefined avg_power → null, never 0 (0 watts is nonsensical for a ride)
    avgPowerW: session.avg_power ?? null,
  };
}
