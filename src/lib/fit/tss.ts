/**
 * Ride TSS estimation — pure function for actual completed rides (D-08).
 *
 * NOTE: This is NOT the planned-session computeTSS in src/lib/training/tss.ts.
 * That function operates on Block arrays for planned sessions (weighted IF across blocks).
 * This function computes TSS from a single real ride's average power and duration.
 *
 * Formula (D-08, RESEARCH Pattern 4, key_facts #4):
 *   IF = avgPowerW / ftp
 *   TSS = round((durationSec × IF² × 100) / 3600)
 *
 * Returns 0 when durationSec is 0 (no ride).
 * Callers must supply a valid ftp > 0; behavior is undefined for ftp ≤ 0.
 */

/**
 * Estimate TSS for a completed ride.
 *
 * @param durationSec - Total ride duration in seconds
 * @param avgPowerW   - Average power output in watts
 * @param ftp         - Rider's Functional Threshold Power in watts
 * @returns TSS as a rounded integer
 */
export function estimateRideTSS(
  durationSec: number,
  avgPowerW: number,
  ftp: number
): number {
  if (durationSec === 0) return 0;
  const IF = avgPowerW / ftp;
  return Math.round((durationSec * IF * IF * 100) / 3600);
}
