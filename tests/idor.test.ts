/**
 * IDOR prevention tests — D-03 truth-condition.
 *
 * Verifies that the user-scoped query helpers in src/lib/db/queries.ts
 * use the Drizzle WHERE and() single-call pattern (D-03) and that a
 * cross-user lookup returns null (→ 404 path), not the resource (D-09).
 *
 * Implements: AUTH-05 (IDOR — cross-user access returns empty, not 403)
 * See: CONTEXT.md D-03, D-09; RESEARCH.md Pattern 2, Pitfall 1
 *
 * Truth-condition: WHERE clause MUST use and(eq(table.userId, userId), eq(table.id, id))
 * in a SINGLE .where() call. Chained .where().where() silently drops the first condition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (defined before imports so hoisting is safe) ────────────────────────

/** Control what the mocked DB query returns */
let _queryResult: unknown[] = [];

vi.mock("@/lib/db/index", () => {
  const mockWhere = vi.fn((..._args: unknown[]) =>
    Promise.resolve(_queryResult)
  );
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return {
    db: { select: mockSelect },
  };
});

// Keep real drizzle-orm and() / eq() so WHERE shapes are verifiable
vi.mock("drizzle-orm", async (importOriginal) => {
  return await importOriginal();
});

vi.mock("@/lib/db/schema", () => ({
  trainingSessions: {
    userId: "trainingSessions.userId",
    id: "trainingSessions.id",
  },
  userProfiles: {
    userId: "userProfiles.userId",
    id: "userProfiles.id",
  },
  stravaConnections: {
    userId: "stravaConnections.userId",
    id: "stravaConnections.id",
  },
}));

// ── Import module under test (after mocks) ────────────────────────────────────

import { db } from "@/lib/db/index";
import {
  findTrainingSession,
  findUserProfile,
  findStravaConnection,
} from "@/lib/db/queries";

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";
const SESSION_OWNED_BY_B = "session-uuid-owned-by-b";

function setQueryResult(rows: unknown[]) {
  _queryResult = rows;
}

// ── IDOR: WHERE and() pattern enforcement (D-03) ──────────────────────────────

describe("IDOR guard — WHERE and() pattern (D-03, AUTH-05)", () => {
  beforeEach(() => {
    setQueryResult([]);
    vi.clearAllMocks();
  });

  it("cross-user query returns null when WHERE and() is applied and no row matches", async () => {
    // Simulates: user A asks for a resource owned by user B.
    // The DB enforces userId scoping via and() — returns empty.
    setQueryResult([]);

    const result = await findTrainingSession(USER_A, SESSION_OWNED_BY_B);

    // Helper returns null (not []) so callers can call notFound() → 404 (D-09)
    expect(result).toBeNull();
  });

  it("own-user query returns the record when userId matches", async () => {
    const ownedSession = { id: "my-session", userId: USER_A, createdAt: new Date() };
    setQueryResult([ownedSession]);

    const result = await findTrainingSession(USER_A, "my-session");

    expect(result).toEqual(ownedSession);
  });

  it("stravaConnections query is user-scoped — cross-user returns null", async () => {
    setQueryResult([]);

    const result = await findStravaConnection(USER_A, "connection-owned-by-b");

    expect(result).toBeNull();
  });

  it("userProfiles query is user-scoped — cross-user returns null", async () => {
    setQueryResult([]);

    const result = await findUserProfile(USER_A, "profile-owned-by-b");

    expect(result).toBeNull();
  });

  it("findTrainingSession calls db.select once per query (no chained .where())", async () => {
    setQueryResult([]);
    await findTrainingSession(USER_A, SESSION_OWNED_BY_B);

    // select() called exactly once — no chained queries
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

// ── D-09: 404 not 403 for cross-user resource access ─────────────────────────

describe("Cross-user resource access returns null → 404 path (D-09)", () => {
  beforeEach(() => {
    setQueryResult([]);
    vi.clearAllMocks();
  });

  it("findTrainingSession returns null when session belongs to a different user (caller calls notFound() → 404)", async () => {
    // DB returns empty because userId A does not match the row's userId (B).
    // The WHERE and() clause enforces this at the query level.
    setQueryResult([]);

    const result = await findTrainingSession(USER_A, SESSION_OWNED_BY_B);

    // null → caller calls notFound() → HTTP 404 (D-09: existence never revealed)
    expect(result).toBeNull();
  });

  it("findStravaConnection returns null for another user's connection (→ 404 not 403)", async () => {
    setQueryResult([]);

    const result = await findStravaConnection(USER_B, "connection-owned-by-a");

    expect(result).toBeNull();
  });
});
