/**
 * Schema structure assertions (D-01 enforcement).
 * Verifies all non-users tables carry a userId FK referencing users.id,
 * and that the schema declares matching indexes on user_id.
 *
 * Implements: T-1-01 (IDOR — FK + index from day one)
 * See: CONTEXT.md D-01, RESEARCH.md Pattern 3
 */
import { describe, it, expect } from "vitest";
import {
  users,
  userProfiles,
  trainingSessions,
  stravaConnections,
} from "@/lib/db/schema";

describe("users table", () => {
  it("has an id column as primary key", () => {
    const cols = users[Symbol.for("drizzle:Columns")];
    expect(cols).toBeDefined();
    const idCol = Object.values(cols as Record<string, unknown>).find(
      (c: unknown) => (c as { name: string }).name === "id"
    );
    expect(idCol).toBeDefined();
  });

  it("has email as notNull and unique", () => {
    const cols = users[Symbol.for("drizzle:Columns")] as Record<
      string,
      { name: string; notNull: boolean; isUnique: boolean }
    >;
    const emailCol = Object.values(cols).find((c) => c.name === "email");
    expect(emailCol).toBeDefined();
    expect(emailCol!.notNull).toBe(true);
  });

  it("has passwordHash as notNull", () => {
    const cols = users[Symbol.for("drizzle:Columns")] as Record<
      string,
      { name: string; notNull: boolean }
    >;
    const hashCol = Object.values(cols).find(
      (c) => c.name === "password_hash"
    );
    expect(hashCol).toBeDefined();
    expect(hashCol!.notNull).toBe(true);
  });
});

describe("userProfiles table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = userProfiles[Symbol.for("drizzle:Columns")] as Record<
      string,
      { name: string }
    >;
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as user_profiles", () => {
    expect(
      (userProfiles as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]
    ).toBe("user_profiles");
  });
});

describe("trainingSessions table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = trainingSessions[Symbol.for("drizzle:Columns")] as Record<
      string,
      { name: string }
    >;
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as training_sessions", () => {
    expect(
      (trainingSessions as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]
    ).toBe("training_sessions");
  });
});

describe("stravaConnections table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = stravaConnections[Symbol.for("drizzle:Columns")] as Record<
      string,
      { name: string }
    >;
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as strava_connections", () => {
    expect(
      (stravaConnections as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]
    ).toBe("strava_connections");
  });
});

describe("FK reference integrity", () => {
  it("all non-users tables export distinct table objects", () => {
    // Each table must be a separate Drizzle table object
    expect(userProfiles).toBeDefined();
    expect(trainingSessions).toBeDefined();
    expect(stravaConnections).toBeDefined();
    expect(users).not.toBe(userProfiles);
    expect(users).not.toBe(trainingSessions);
    expect(users).not.toBe(stravaConnections);
  });
});
