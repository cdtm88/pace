/**
 * TSS estimation + intensity label utility — pure TypeScript, zero dependencies.
 *
 * computeTSS returns null when FTP is absent (PROG-01 RPE fallback path).
 * computeIntensityLabel returns null when FTP is set (TSS is shown instead).
 *
 * Used by:
 *   - Phase 4: session page (server-side, passed as prop)
 *
 * Formula source: CONTEXT.md D-10
 *   TSS = totalSec × IF² × 100 / 3600
 *   where IF = weighted average powerFraction across all blocks (weighted by durationSec).
 */

type Block = { durationSec: number; powerFraction: number };

/**
 * Estimated TSS for an interval session.
 * Formula: TSS = totalSec × IF² × 100 / 3600
 * where IF = weighted average powerFraction across all blocks.
 * Returns null when ftp is absent (PROG-01 RPE path).
 * Returns null when totalSec is 0.
 */
export function computeTSS(
  blocks: Block[],
  ftp: number | null
): number | null {
  if (!ftp) return null;

  const totalSec = blocks.reduce((sum, b) => sum + b.durationSec, 0);
  if (totalSec === 0) return null;

  const weightedIF =
    blocks.reduce((sum, b) => sum + b.powerFraction * b.durationSec, 0) /
    totalSec;

  return Math.round((totalSec * weightedIF * weightedIF * 100) / 3600);
}

/**
 * Intensity label from weighted average powerFraction (PROG-01 no-FTP path).
 * Returns null when ftp is set (TSS is shown instead).
 * Returns null when totalSec is 0.
 * Thresholds per D-10: < 0.65 → "Easy"; < 0.80 → "Moderate"; ≥ 0.80 → "Hard".
 * The ≥ 0.80 branch covers all higher intensities — no fourth label exists.
 */
export function computeIntensityLabel(
  blocks: Block[],
  ftp: number | null
): "Easy" | "Moderate" | "Hard" | null {
  if (ftp) return null;

  const totalSec = blocks.reduce((sum, b) => sum + b.durationSec, 0);
  if (totalSec === 0) return null;

  const avgFraction =
    blocks.reduce((sum, b) => sum + b.powerFraction * b.durationSec, 0) /
    totalSec;

  if (avgFraction < 0.65) return "Easy";
  if (avgFraction < 0.80) return "Moderate";
  return "Hard";
}
