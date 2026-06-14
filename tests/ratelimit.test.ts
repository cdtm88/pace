/**
 * Rate limit stubs — RED phase (Wave 0 gap closure).
 * These tests are stubs that will fail until rate limiting is implemented
 * in Phase 1 Plan 02 (auth route handlers + Upstash Redis).
 *
 * Implements: AUTH-04 (dual-axis rate limiting)
 * See: CONTEXT.md D-10, RESEARCH.md Pattern 4, Pitfall 6
 */
import { describe, it } from "vitest";

// ── Per-IP rate limit (D-10: 10 attempts / 15 min) ───────────────────────────

describe("Login rate limit — per-IP (AUTH-04)", () => {
  it.todo(
    "returns 429 on the 11th login attempt from the same IP within 15 minutes"
  );
  // Implementing plan: 01-02

  it.todo(
    'returns generic "Too many attempts" message with no timing info on 429 (D-10)'
  );
  // Implementing plan: 01-02

  it.todo("allows the 10th attempt from the same IP (boundary: 10/15min)");
  // Implementing plan: 01-02
});

// ── Per-email rate limit (D-10: 5 attempts / 15 min) ─────────────────────────

describe("Login rate limit — per-email (AUTH-04)", () => {
  it.todo(
    "returns 429 on the 6th login attempt with the same email within 15 minutes"
  );
  // Implementing plan: 01-02

  it.todo("allows the 5th attempt with the same email (boundary: 5/15min)");
  // Implementing plan: 01-02

  it.todo("blocks when email limit fires even if IP limit has not fired");
  // Implementing plan: 01-02

  it.todo("blocks when IP limit fires even if email limit has not fired");
  // Implementing plan: 01-02
});
