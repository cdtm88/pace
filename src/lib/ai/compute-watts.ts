/**
 * Server-side watt / power fraction computation (D-02).
 *
 * Both powerFraction AND targetWatts are always present on every block
 * stored in the DB. This function fills the missing field from the one
 * Claude provides, using the dual-path logic in D-02:
 *
 *   With FTP:    Claude returns powerFraction
 *                → targetWatts = round(powerFraction * ftp)
 *
 *   Without FTP: Claude returns targetWatts
 *                → powerFraction = targetWatts / NO_FTP_REFERENCE_WATTS
 *
 * CRITICAL: NO_FTP_REFERENCE_WATTS (150W) is an INTERNAL Phase 4 .zwo-export
 * reference constant. It represents a reasonable reference FTP for generating
 * .zwo power fractions when the user has not set their FTP. It is NEVER
 * displayed to the user as their FTP value (Pitfall 4 from RESEARCH.md).
 */
import type { GeneratedSession } from "@/lib/db/schemas/session";

/**
 * Internal Phase 4 reference watts for .zwo export computation.
 * Used ONLY when FTP is absent to derive a powerFraction from targetWatts.
 * NEVER display this value to the user as their FTP.
 */
export const NO_FTP_REFERENCE_WATTS = 150;

type SessionBlock = GeneratedSession["blocks"][number];

/**
 * Fill both powerFraction and targetWatts on every block based on FTP presence.
 *
 * @param blocks - Array of interval blocks from the Zod-validated AI response
 * @param ftp - The user's FTP in watts (null when not set)
 * @returns New array of blocks with both powerFraction and targetWatts populated
 */
export function computeWattTargets(
  blocks: SessionBlock[],
  ftp: number | null
): SessionBlock[] {
  return blocks.map((block) => {
    if (ftp !== null) {
      // FTP path (D-02): Claude provides powerFraction; compute targetWatts server-side.
      // Math.round ensures integer watts — never a decimal displayed to the user.
      return {
        ...block,
        targetWatts: Math.round(block.powerFraction * ftp),
      };
    } else {
      // No-FTP path (D-02): Claude provides targetWatts; derive powerFraction
      // using the internal 150W reference (Phase 4 .zwo export use only).
      return {
        ...block,
        powerFraction: block.targetWatts / NO_FTP_REFERENCE_WATTS,
      };
    }
  });
}
