"use client";

/**
 * LoginForm — client component for /login screen (UI-SPEC §States: /login).
 *
 * Posts to /api/auth/login on submit. Handles:
 *   - Loading state: disabled button + "Signing in…" + Loader2 spinner + aria-busy
 *   - Auth errors: page-level ErrorBanner with copy.ts strings (D-07, D-10)
 *   - Client-side validation: email format, password min length (before POST)
 *   - On success: redirect to /dashboard
 *
 * Input attributes (UI-SPEC §Interaction Contract — required on all form inputs):
 *   - Email: type="email" inputMode="email" autoComplete="email"
 *   - Password: type="password" autoComplete="current-password"
 * Input height: 48px minimum (UI-SPEC — iOS touch target + auto-zoom prevention)
 * Input font: 16px (UI-SPEC — prevents iOS Safari auto-zoom on focus)
 *
 * Accessibility (UI-SPEC §Accessibility Contract):
 *   - Labels via <Label htmlFor>
 *   - Errors via aria-describedby → error <p id>
 *   - aria-busy="true" + disabled on submit during flight
 *   - role="alert" on ErrorBanner (defined in error-banner.tsx)
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { COPY } from "@/lib/copy";

interface LoginFormProps {
  /** Show signup link? Only when SIGNUP_ENABLED=true (server-side decision). */
  showSignupLink: boolean;
}

export function LoginForm({ showSignupLink }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(COPY.FIELD_ERROR_EMAIL_INVALID);
      valid = false;
    }
    if (password.length < 8) {
      setPasswordError(COPY.FIELD_ERROR_PASSWORD_TOO_SHORT);
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setPageError(COPY.AUTH_ERROR_RATE_LIMITED);
      } else if (res.status === 401 || res.status === 400) {
        setPageError(data?.error ?? COPY.AUTH_ERROR_INVALID);
      } else {
        setPageError(COPY.AUTH_ERROR_SERVER);
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
        {COPY.LOGIN_HEADING}
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
            autoComplete="current-password"
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
            {COPY.LOGIN_CTA_LOADING}
          </>
        ) : (
          COPY.LOGIN_CTA
        )}
      </Button>

      {/* Signup link — only when SIGNUP_ENABLED=true */}
      {showSignupLink && (
        <p className="text-center text-sm text-muted-foreground">
          {COPY.LINK_DONT_HAVE_ACCOUNT}{" "}
          <a
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COPY.LINK_SIGNUP}
          </a>
        </p>
      )}
    </form>
  );
}
