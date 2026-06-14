/**
 * validateSessionSafety — deterministic safety gate (D-04).
 *
 * Runs AFTER Zod parse (D-09 order). Input is always a valid GeneratedSession.
 * Returns { safe: boolean; reason?: string }. Reason is server-log only — never
 * surface to user. User sees generic "Couldn't generate a valid session." message.
 *
 * Four checks (independent of AI and Zod — defense-in-depth per D-04):
 *   1. totalDurationSec ≤ 14400 (4h ceiling, also in Zod)
 *   2. No block powerFraction > 1.5 (tighter than Zod's 1.8; STATE.md: "suggested powerFraction ≤ 1.5")
 *   3. ≤ 3 consecutive work blocks without an intervening rest or cooldown
 *   4. blocks.length ≥ 2 (minimum: warmup + one work block)
 */
import type { GeneratedSession } from "@/lib/db/schemas/session";

export function validateSessionSafety(
  session: GeneratedSession
): { safe: boolean; reason?: string } {
  // Check 1: total duration ceiling (defense-in-depth — Zod already enforces this)
  if (session.totalDurationSec > 14400) {
    return {
      safe: false,
      reason: `totalDurationSec ${session.totalDurationSec} exceeds 4h (14400s) ceiling`,
    };
  }

  // Check 4: minimum block count (at least warmup + one work block)
  if (session.blocks.length < 2) {
    return {
      safe: false,
      reason: `Session has only ${session.blocks.length} block(s); minimum is 2`,
    };
  }

  // Check 2: power fraction safety ceiling (1.5 — tighter than Zod's 1.8)
  for (const block of session.blocks) {
    if (block.powerFraction > 1.5) {
      return {
        safe: false,
        reason: `Block ${block.order} powerFraction ${block.powerFraction} exceeds safety ceiling of 1.5`,
      };
    }
  }

  // Check 3: no more than 3 consecutive work blocks without rest/cooldown
  let consecutiveWorkCount = 0;
  for (const block of session.blocks) {
    if (block.type === "work") {
      consecutiveWorkCount++;
      if (consecutiveWorkCount > 3) {
        return {
          safe: false,
          reason: `More than 3 consecutive work blocks detected at block ${block.order}; insert a rest or cooldown`,
        };
      }
    } else if (block.type === "rest" || block.type === "cooldown") {
      // Reset counter on rest or cooldown
      consecutiveWorkCount = 0;
    }
    // warmup does not reset the work counter (warmup only appears at session start)
  }

  return { safe: true };
}
