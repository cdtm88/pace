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

  // ── Phase 2: Onboarding wizard ───────────────────────────────────────────────

  ONBOARDING_STEP1_HEADING: "What are your training goals?",
  ONBOARDING_STEP1_HELPER: "Tell Claude what you're working toward. Be specific — more detail means better sessions.",
  ONBOARDING_STEP2_HEADING: "Any injuries or health considerations?",
  ONBOARDING_STEP2_HELPER: "Optional. Claude uses this to avoid exercises that could aggravate existing issues.",
  ONBOARDING_STEP3_HEADING: "Your training data",
  ONBOARDING_STEP3_HELPER: "Both are optional. FTP unlocks power zone labels and TSS estimates. You can add these later.",
  ONBOARDING_CTA_NEXT: "Next",
  ONBOARDING_CTA_BACK: "Back",
  ONBOARDING_CTA_SUBMIT: "Get started",
  ONBOARDING_CTA_LOADING: "Setting up your profile…",

  // ── Phase 2: Profile edit ────────────────────────────────────────────────────

  PROFILE_EDIT_HEADING: "Edit profile",
  PROFILE_EDIT_SUBTEXT: "Changes are saved immediately.",
  PROFILE_CTA_SAVE: "Save profile",
  PROFILE_CTA_LOADING: "Saving…",

  // ── Phase 2: Dashboard ───────────────────────────────────────────────────────

  DASHBOARD_WELCOME: "Welcome back",
  DASHBOARD_EMPTY_HEADING: "You're all set",
  DASHBOARD_EMPTY_BODY: "Session generation is coming next. Your profile is ready.",
  DASHBOARD_FTP_ACTIVE: "FTP: {value}W · Coggan zones active",
  DASHBOARD_FTP_ABSENT: "No FTP set · Using RPE mode",
  DASHBOARD_LINK_EDIT_PROFILE: "Edit profile",

  // ── Phase 2: Field errors ────────────────────────────────────────────────────

  FIELD_ERROR_GOALS_REQUIRED: "Describe your training goals to continue.",
  FIELD_ERROR_FTP_RANGE: "FTP must be between 50 and 700 watts.",
  FIELD_ERROR_WEIGHT_RANGE: "Enter your weight in kilograms (30–250).",

  // ── Phase 2: Field labels ────────────────────────────────────────────────────

  FIELD_LABEL_GOALS: "Goals",
  FIELD_LABEL_INJURIES: "Injury & health notes",
  FIELD_LABEL_FTP: "FTP",
  FIELD_LABEL_WEIGHT: "Weight",

  // ── Phase 2: Field placeholders ──────────────────────────────────────────────

  FIELD_PLACEHOLDER_GOALS: "e.g. Build base fitness for a gran fondo in October, currently riding 3x week at Z2",
  FIELD_PLACEHOLDER_INJURIES: "e.g. Left knee tendinitis — no high-cadence sprints; cleared for threshold work",
  FIELD_PLACEHOLDER_FTP: "e.g. 250",
  FIELD_PLACEHOLDER_WEIGHT: "e.g. 70",

  // ── Phase 2: Field units + helpers ───────────────────────────────────────────

  FIELD_UNIT_FTP: "watts",
  FIELD_UNIT_WEIGHT: "kg",
  FIELD_OPTIONAL_LABEL: "Optional",
  STEP_COUNTER: "Step {n} of 3",
} as const;
