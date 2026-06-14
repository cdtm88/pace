/**
 * Zod v4 profile validation schema (V5 ASVS).
 *
 * CRITICAL — Zod v4 z.coerce.number() caveat (Pitfall 2):
 *   z.coerce.number() converts "" (empty string from FormData) to NaN, which
 *   fails the number check even on optional fields.
 *   Callers must pass `formData.get('ftp') || undefined` before parsing —
 *   this converts empty string to undefined, which .optional() accepts correctly.
 *   The schema itself stays .optional() to accept both absent and present values.
 *
 * Error messages match UI-SPEC Copywriting Contract (FIELD_ERROR_GOALS_REQUIRED).
 */
import { z } from "zod";

export const profileSchema = z.object({
  goals: z.string().min(1, "Describe your training goals to continue.").max(1000),
  injuries: z.string().max(1000).optional().default(""),
  ftp: z.coerce.number().int().min(50).max(700).optional(),
  weight: z.coerce.number().min(30).max(250).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
