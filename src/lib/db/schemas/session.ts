/**
 * Zod v4 schema for Claude AI session output (D-03).
 *
 * Validates raw JSON from the Anthropic API before any DB write or safety gate check.
 * Bounds defined in CONTEXT.md D-03 and STATE.md safety notes.
 *
 * Zod v4 breaking changes (CLAUDE.md):
 *   - error.issues (not .errors)
 *   - z.number().min/max() — same as v3 for numeric bounds
 */
import { z } from "zod";

export const SessionBlockSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(["warmup", "work", "rest", "cooldown"]),
  durationSec: z.number().int().positive().max(5400), // ≤90 min per block
  powerFraction: z.number().min(0.1).max(1.8),        // GEN-02 bounds; safety gate tightens to 1.5
  targetWatts: z.number().int().positive(),
  rpe: z.enum(["Easy", "Moderate", "Hard", "Very Hard"]),
  description: z.string().min(1).max(200),
});

export const GeneratedSessionSchema = z.object({
  title: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  totalDurationSec: z.number().int().positive().max(14400), // ≤4h (STATE.md)
  blocks: z.array(SessionBlockSchema).min(1).max(20),
});

export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>;
