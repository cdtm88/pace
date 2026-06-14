"use client";

/**
 * SignupForm — client component for /signup screen (UI-SPEC §States: /signup).
 *
 * Posts to /api/auth/signup on submit. Handles:
 *   - Loading state: disabled button + "Creating account…" + Loader2 spinner + aria-busy
 *   - Auth errors: page-level ErrorBanner (D-11 registration closed, server error)
 *   - Client-side validation: email format, password min length, confirm match
 *   - Password mismatch: inline error "Passwords don't match" on confirm field
 *   - On success: redirect to /dashboard
 *
 * Input attributes (UI-SPEC §Interaction Contract):
 *   - Email: type="email" inputMode="email" autoComplete="email"
 *   - Password: type="password" autoComplete="new-password"
 *   - Confirm: type="password" autoComplete="new-password"
 * Input height: 48px (UI-SPEC — iOS touch target + auto-zoom prevention)
 * Input font: 16px minimum (UI-SPEC — prevents iOS Safari auto-zoom)
 *
 * Accessibility (UI-SPEC §Accessibility Contract):
 *   - Labels via <Label htmlFor>
 *   - Errors via aria-describedby → error <p id>
 *   - aria-busy + disabled on button during flight
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { COPY } from "@/lib/copy";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(COPY.FIELD_ERROR_EMAIL_INVALID);
      valid = false;
    }
    if (password.length < 8) {
      setPasswordError(COPY.FIELD_ERROR_PASSWORD_TOO_SHORT);
      valid = false;
    }
    if (password !== confirm) {
      setConfirmError(COPY.FIELD_ERROR_PASSWORDS_DONT_MATCH);
      valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPageError(null);

    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirm }),
      });

      if (res.ok) {
        router.push("/dashboard");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        // Registration is not open (D-11)
        setPageError(data?.error ?? COPY.AUTH_ERROR_REGISTRATION_CLOSED);
      } else {
        setPageError(data?.error ?? COPY.AUTH_ERROR_SERVER);
      }
    } catch {
      setPageError(COPY.AUTH_ERROR_SERVER);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Page heading — 24px/600 (UI-SPEC §Typography Heading) */}
      <h1 className="text-2xl font-semibold leading-[1.2] text-foreground">
        {COPY.SIGNUP_HEADING}
      </h1>

      {/* Page-level error banner — above submit button (UI-SPEC §States) */}
      {pageError && <ErrorBanner message={pageError} />}

      <div className="space-y-4">
        {/* Email field */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-base font-medium text-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-describedby={emailError ? "email-error" : undefined}
            aria-invalid={!!emailError}
            required
            disabled={isLoading}
            className="h-12 text-base"
          />
          {emailError && (
            <p id="email-error" className="text-sm text-destructive">
              {emailError}
            </p>
          )}
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-base font-medium text-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby={passwordError ? "password-error" : undefined}
            aria-invalid={!!passwordError}
            required
            disabled={isLoading}
            className="h-12 text-base"
          />
          {passwordError && (
            <p id="password-error" className="text-sm text-destructive">
              {passwordError}
            </p>
          )}
        </div>

        {/* Confirm password field */}
        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-base font-medium text-foreground">
            Confirm password
          </Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            aria-describedby={confirmError ? "confirm-error" : undefined}
            aria-invalid={!!confirmError}
            required
            disabled={isLoading}
            className="h-12 text-base"
          />
          {confirmError && (
            <p id="confirm-error" className="text-sm text-destructive">
              {confirmError}
            </p>
          )}
        </div>
      </div>

      {/* Submit button — white CTA (UI-SPEC §Color accent) */}
      <Button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="h-12 w-full text-base font-medium"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {COPY.SIGNUP_CTA_LOADING}
          </>
        ) : (
          COPY.SIGNUP_CTA
        )}
      </Button>

      {/* Login link */}
      <p className="text-center text-sm text-muted-foreground">
        {COPY.LINK_ALREADY_HAVE_ACCOUNT}{" "}
        <a
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {COPY.LINK_SIGNIN}
        </a>
      </p>
    </form>
  );
}
