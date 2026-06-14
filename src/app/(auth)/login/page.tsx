/**
 * Login page — /login (UI-SPEC §Scope).
 *
 * Server component: reads SIGNUP_ENABLED env var to decide whether to render
 * the "Don't have an account? Sign up" link in LoginForm.
 *
 * Rendering: AuthCard (zinc-950 bg, zinc-900 card, "Pace" wordmark) + LoginForm.
 * Not gated — /login is always accessible (PUBLIC_PATHS in proxy.ts).
 */
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const signupEnabled = process.env.SIGNUP_ENABLED === "true";

  return (
    <AuthCard>
      <LoginForm showSignupLink={signupEnabled} />
    </AuthCard>
  );
}
