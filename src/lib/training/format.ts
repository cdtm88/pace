/**
 * Shared duration formatting utility — pure TypeScript, zero dependencies.
 *
 * Used by:
 *   - Phase 3: SessionGenerator (dashboard session summary card)
 *   - Phase 4: session page (pre-ride badge row, block list)
 */

/** Format total duration in seconds to human-readable "X min" or "Xh Ym". */
export function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
