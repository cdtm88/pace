/**
 * Single-sourced UI copy strings — Copywriting Contract (UI-SPEC.md).
 *
 * ALL user-visible text in auth screens must come from this file.
 * Prevents string drift, ensures anti-enumeration compliance (D-07, AUTH-04),
 * and enables verifying exact wording in tests.
 *
 * See: UI-SPEC.md §Copywriting Contract, CONTEXT.md D-07, D-10, D-11
 */

// ── Page headings ─────────────────────────────────────────────────────────────

export const COPY = {
  // Page headings
  LOGIN_HEADING: "Sign in to Pace",
  SIGNUP_HEADING: "Create your account",

  // Primary CTAs
  LOGIN_CTA: "Sign in",
  LOGIN_CTA_LOADING: "Signing in…",
  SIGNUP_CTA: "Create account",
  SIGNUP_CTA_LOADING: "Creating account…",

  // Auth errors (D-07, D-10, D-11 — anti-enumeration; exact strings required)
  AUTH_ERROR_INVALID: "Invalid email or password",
  AUTH_ERROR_RATE_LIMITED: "Too many attempts. Try again in a few minutes.",
  AUTH_ERROR_SERVER: "Something went wrong. Please try again.",
  AUTH_ERROR_REGISTRATION_CLOSED: "Registration is not open.",

  // Field validation errors (client-side; match UI-SPEC verbatim)
  FIELD_ERROR_EMAIL_INVALID: "Enter a valid email address",
  FIELD_ERROR_PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
  FIELD_ERROR_PASSWORDS_DONT_MATCH: "Passwords don't match",

  // Navigation links
  LINK_DONT_HAVE_ACCOUNT: "Don't have an account?",
  LINK_SIGNUP: "Sign up",
  LINK_ALREADY_HAVE_ACCOUNT: "Already have an account?",
  LINK_SIGNIN: "Sign in",

  // Wordmark (UI-SPEC §Component Inventory)
  WORDMARK: "Pace",
} as const;
