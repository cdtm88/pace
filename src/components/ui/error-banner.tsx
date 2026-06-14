/**
 * ErrorBanner — page-level error display (UI-SPEC §States per Screen).
 *
 * Rendered above the submit button inside the auth card for server-level errors:
 * rate limiting, invalid credentials, server errors, registration closed.
 *
 * Accessibility (UI-SPEC §Accessibility Contract):
 *   - role="alert" — screen reader announces on mount
 *   - Text in red-500 (destructive) — visual indicator
 *   - Not used for field-level errors (those use aria-describedby on inputs)
 */
interface ErrorBannerProps {
  message: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
