/**
 * IDOR prevention stubs — RED phase (Wave 0 gap closure).
 * These tests are stubs verifying the Drizzle WHERE and() pattern (D-03)
 * prevents cross-user data access. Full implementation in Phase 1 Plan 02
 * when query helpers exist.
 *
 * Implements: AUTH-05 (IDOR — cross-user access returns empty, not 403)
 * See: CONTEXT.md D-03, D-09, RESEARCH.md Pattern 2, Pitfall 1
 *
 * Truth-condition: Drizzle WHERE clause MUST use the and() single-call pattern.
 * Chained .where().where() silently drops the first condition — IDOR vulnerability.
 * Pattern: .where(and(eq(table.userId, session.id), eq(table.id, requestedId)))
 */
import { describe, it } from "vitest";

// ── IDOR: WHERE and() pattern enforcement (D-03) ──────────────────────────────

describe("IDOR guard — WHERE and() pattern (D-03, AUTH-05)", () => {
  it.todo(
    "cross-user query returns empty array when WHERE and() is applied correctly"
  );
  // Implementing plan: 01-02
  // Pattern: .where(and(eq(trainingSessions.userId, userAId), eq(trainingSessions.id, userBSessionId)))
  // Expected: [] (empty — user A cannot access user B's session)

  it.todo(
    "own-user query returns the record when WHERE and() userId matches session.id"
  );
  // Implementing plan: 01-02

  it.todo("stravaConnections query is user-scoped with and()");
  // Implementing plan: 01-02

  it.todo("userProfiles query is user-scoped with and()");
  // Implementing plan: 01-02
});

// ── D-09: 404 not 403 for cross-user resource access ─────────────────────────

describe("Cross-user resource access returns 404, not 403 (D-09)", () => {
  it.todo(
    "GET /api/sessions/[id] returns 404 when session belongs to different user"
  );
  // Implementing plan: 01-02
  // D-09: existence of a resource is never revealed to an unauthorized requester
});
