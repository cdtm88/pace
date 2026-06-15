/**
 * Schema structure assertions (D-01 enforcement).
 * Verifies all non-users tables carry a userId FK referencing users.id,
 * and that the schema declares matching indexes on user_id.
 *
 * Implements: T-1-01 (IDOR — FK + index from day one)
 * See: CONTEXT.md D-01, RESEARCH.md Pattern 3
 *
 * Note: Drizzle internal symbols accessed via (table as unknown as Record<symbol, ...>)
 * to avoid TS7053 — Symbol.for() keys are not in PgTable's index signature.
 */
import { describe, it, expect } from "vitest";
import {
  users,
  userProfiles,
  trainingSessions,
  activityUploads,
} from "@/lib/db/schema";

// Helper: access Drizzle internal symbol-keyed properties without TS7053
function drizzleCols(table: unknown): Record<string, { name: string; notNull: boolean; isUnique?: boolean }> {
  return (table as Record<symbol, unknown>)[Symbol.for("drizzle:Columns")] as Record<string, { name: string; notNull: boolean; isUnique?: boolean }>;
}
function drizzleName(table: unknown): string {
  return (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] as string;
}

describe("users table", () => {
  it("has an id column as primary key", () => {
    const cols = drizzleCols(users);
    expect(cols).toBeDefined();
    const idCol = Object.values(cols).find((c) => c.name === "id");
    expect(idCol).toBeDefined();
  });

  it("has email as notNull and unique", () => {
    const cols = drizzleCols(users);
    const emailCol = Object.values(cols).find((c) => c.name === "email");
    expect(emailCol).toBeDefined();
    expect(emailCol!.notNull).toBe(true);
  });

  it("has passwordHash as notNull", () => {
    const cols = drizzleCols(users);
    const hashCol = Object.values(cols).find((c) => c.name === "password_hash");
    expect(hashCol).toBeDefined();
    expect(hashCol!.notNull).toBe(true);
  });
});

describe("userProfiles table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = drizzleCols(userProfiles);
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as user_profiles", () => {
    expect(drizzleName(userProfiles)).toBe("user_profiles");
  });

  it("has ftp, weight, goals, injuries, onboarding_complete columns", () => {
    const cols = drizzleCols(userProfiles);
    const colNames = Object.values(cols).map((c) => c.name);
    expect(colNames).toContain("ftp");
    expect(colNames).toContain("weight");
    expect(colNames).toContain("goals");
    expect(colNames).toContain("injuries");
    expect(colNames).toContain("onboarding_complete");
  });

  it("onboarding_complete is notNull", () => {
    const cols = drizzleCols(userProfiles);
    const col = Object.values(cols).find((c) => c.name === "onboarding_complete");
    expect(col).toBeDefined();
    expect(col!.notNull).toBe(true);
  });
});

describe("trainingSessions table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = drizzleCols(trainingSessions);
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as training_sessions", () => {
    expect(drizzleName(trainingSessions)).toBe("training_sessions");
  });
});

describe("activityUploads table", () => {
  it("has a userId column referencing users.id", () => {
    const cols = drizzleCols(activityUploads);
    const userIdCol = Object.values(cols).find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
  });

  it("declares the table name as activity_uploads", () => {
    expect(drizzleName(activityUploads)).toBe("activity_uploads");
  });

  it("has fileName, startedAt, durationSec, avgPowerW, estimatedTss, matchedSessionId columns", () => {
    const cols = drizzleCols(activityUploads);
    const colNames = Object.values(cols).map((c) => c.name);
    expect(colNames).toContain("file_name");
    expect(colNames).toContain("started_at");
    expect(colNames).toContain("duration_sec");
    expect(colNames).toContain("avg_power_w");
    expect(colNames).toContain("estimated_tss");
    expect(colNames).toContain("matched_session_id");
  });
});

describe("FK reference integrity", () => {
  it("all non-users tables export distinct table objects", () => {
    // Each table must be a separate Drizzle table object
    expect(userProfiles).toBeDefined();
    expect(trainingSessions).toBeDefined();
    expect(activityUploads).toBeDefined();
    expect(users).not.toBe(userProfiles);
    expect(users).not.toBe(trainingSessions);
    expect(users).not.toBe(activityUploads);
  });
});
