/**
 * Zod v4 validation schemas for auth route handlers (V5 ASVS).
 *
 * CRITICAL: Zod v4 breaking API changes (CLAUDE.md §Critical Version Constraints):
 *   - z.email()           ← NOT z.string().email() (v3)
 *   - result.error.issues ← NOT result.error.errors  (v3)
 *
 * Error messages follow the Copywriting Contract in UI-SPEC.md.
 */
import { z } from "zod";

/**
 * Login body schema: { email, password }.
 * Password min 8 chars — enough to reject clearly empty submissions at the API
 * boundary (full password strength rules are UX concerns handled in the UI).
 */
export const loginSchema = z.object({
  email: z.email({ message: "Please enter a valid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Signup body schema: { email, password, confirm }.
 * confirm must equal password — validated via .refine().
 */
export const signupSchema = z
  .object({
    email: z.email({ message: "Please enter a valid email address." }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." }),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Extract the first validation error message from a Zod v4 parse result.
 *
 * Zod v4 uses `result.error.issues` (not `.errors`).
 * Returns the first issue's message, or a fallback string.
 */
export function firstIssueMessage(
  result: z.SafeParseError<unknown>
): string {
  return result.error.issues[0]?.message ?? "Invalid input.";
}
