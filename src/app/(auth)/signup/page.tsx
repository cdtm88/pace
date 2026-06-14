/**
 * Signup page — /signup (UI-SPEC §Scope, CONTEXT.md D-11).
 *
 * Server component: enforces the SIGNUP_ENABLED gating rule (D-11):
 *   - If SIGNUP_ENABLED=true → always render signup form
 *   - If SIGNUP_ENABLED=false AND users table is empty → allow (owner bootstrap)
 *   - If SIGNUP_ENABLED=false AND users table has rows → notFound() (404)
 *
 * The owner bootstrap exception is checked server-side with a COUNT query against
 * the users table (D-11). This prevents a user from discovering whether registration
 * is open — they get a 404 when it's gated.
 *
 * notFound() is used (not redirect) to stay consistent with the 404-not-403
 * principle (D-09) and UI-SPEC §States /signup disabled state.
 *
 * Note: force-dynamic prevents static rendering; db is imported lazily inside
 * the function body to avoid module-level initialization errors at build time
 * when DATABASE_URL may not be available to the Turbopack page-data worker.
 */
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

// Force dynamic rendering — this page runs a DB query at request time (D-11).
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const signupEnabled = process.env.SIGNUP_ENABLED === "true";

  if (!signupEnabled) {
    // Lazy import to avoid Neon module-level initialization at build time.
    // Only evaluates when DATABASE_URL is available at request time.
    const { count } = await import("drizzle-orm");
    const { db } = await import("@/lib/db/index");
    const { users } = await import("@/lib/db/schema");

    // Check if this is the first user (owner bootstrap bypass — D-11).
    const result = await db.select({ count: count() }).from(users);
    const userCount = result[0]?.count ?? 0;

    if (userCount > 0) {
      // Registration is not open and a user already exists — gate the route (D-11).
      notFound();
    }
    // userCount === 0: first-user bootstrap — fall through and render the form.
  }

  return (
    <AuthCard>
      <SignupForm />
    </AuthCard>
  );
}
