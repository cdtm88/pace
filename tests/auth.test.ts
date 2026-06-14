/**
 * Auth route handler stubs — RED phase (Wave 0 gap closure).
 * These tests are stubs that will fail until auth route handlers are
 * implemented in Phase 1 Plan 02 (auth endpoints).
 *
 * Implements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
 * See: CONTEXT.md D-04 through D-11, RESEARCH.md §Validation Architecture
 */
import { describe, it, expect } from "vitest";

// ── AUTH-01: Signup ───────────────────────────────────────────────────────────

describe("POST /api/auth/signup", () => {
  it.todo("creates a user with valid email and password (AUTH-01)");
  // Implementing plan: 01-02 (auth route handlers)

  it.todo("hashes password with bcryptjs at cost factor 12 (D-05)");
  // Implementing plan: 01-02

  it.todo("returns 400 for invalid email (Zod v4 z.email validation)");
  // Implementing plan: 01-02

  it.todo("returns 400 for password shorter than 8 characters");
  // Implementing plan: 01-02
});

// ── AUTH-01 + AUTH-05: First-user bootstrap ───────────────────────────────────

describe("POST /api/auth/signup — first-user bootstrap (D-11)", () => {
  it.todo(
    "succeeds when SIGNUP_ENABLED=false but users table is empty (owner bootstrap)"
  );
  // Implementing plan: 01-02

  it.todo("fails with 403 when SIGNUP_ENABLED=false and users table is not empty");
  // Implementing plan: 01-02

  it.todo("succeeds when SIGNUP_ENABLED=true regardless of user count");
  // Implementing plan: 01-02
});

// ── AUTH-02: Login + cookie ───────────────────────────────────────────────────

describe("POST /api/auth/login — session cookie (AUTH-02)", () => {
  it.todo("returns httpOnly cookie with 30-day maxAge on successful login (D-06)");
  // Implementing plan: 01-02

  it.todo("cookie is secure and sameSite=lax (D-06)");
  // Implementing plan: 01-02

  it.todo("session payload contains id and email (D-04)");
  // Implementing plan: 01-02
});

// ── AUTH-04: Generic error (anti-enumeration) ─────────────────────────────────

describe("POST /api/auth/login — generic error (D-07)", () => {
  it.todo(
    'returns "Invalid email or password" for wrong email — same message as wrong password (AUTH-04)'
  );
  // Implementing plan: 01-02

  it.todo(
    'returns "Invalid email or password" for wrong password — same message as wrong email (AUTH-04)'
  );
  // Implementing plan: 01-02
});

// ── AUTH-03: Logout ───────────────────────────────────────────────────────────

describe("POST /api/auth/logout (AUTH-03)", () => {
  it.todo("destroys the session and redirects to /login");
  // Implementing plan: 01-02
});
