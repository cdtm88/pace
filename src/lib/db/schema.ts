/**
 * Drizzle schema — all 4 app tables (D-01).
 *
 * RULE: Every table except `users` carries a userId UUID FK with an index.
 * No table is ever created without it — multi-user architecture from day one.
 * Schema changes after Phase 1 require Drizzle migrations.
 *
 * IDOR guard: All user-scoped queries MUST use the and() single-call pattern
 * (D-03 truth-condition). See RESEARCH.md Pattern 2.
 * Pattern: .where(and(eq(table.userId, session.id), eq(table.id, requestedId)))
 * NEVER chain: .where(eq(...)).where(eq(...)) — Drizzle silently drops the first!
 *
 * FK note: onDelete "cascade" ensures orphaned cross-user rows cannot persist
 * after user deletion (T-1-IDOR-FK mitigation).
 */
import { pgTable, uuid, text, timestamp, index, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";

// ── users ─────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── user_profiles ─────────────────────────────────────────────────────────────
// Phase 2 profile columns added:
//   ftp integer (nullable), weight real (nullable), goals text (nullable),
//   injuries text (nullable), onboarding_complete boolean NOT NULL DEFAULT false

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id FK — required on every non-users table (D-01)
    // .unique() enforces one-profile-per-user; required for onConflictDoUpdate target (T-02-03)
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    // Phase 2: profile columns — ftp/weight/goals/injuries nullable (PROF-01: FTP not required)
    ftp: integer("ftp"),
    weight: real("weight"),
    goals: text("goals"),
    injuries: text("injuries"),
    // NOT NULL DEFAULT false — safe migration on existing rows (T-02-02 / Pitfall 4)
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("user_profiles_user_id_idx").on(t.userId)]
);

// ── training_sessions ─────────────────────────────────────────────────────────
// Phase 3 D-01 session content columns (via migration 0002):
//   title text NOT NULL, notes text, readiness_score integer NOT NULL,
//   blocks jsonb NOT NULL, total_duration_sec integer NOT NULL, raw_json text

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id FK — required on every non-users table (D-01)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // D-01: session content columns — FK first, domain columns, timestamps last
    title: text("title").notNull(),
    notes: text("notes"),
    readinessScore: integer("readiness_score").notNull(),
    blocks: jsonb("blocks").notNull(),
    totalDurationSec: integer("total_duration_sec").notNull(),
    rawJson: text("raw_json"),   // nullable; debug only; never display to user
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("training_sessions_user_id_idx").on(t.userId)]
);

// ── activity_uploads ──────────────────────────────────────────────────────────
// Phase 5 D-04: Replaces the strava_connections skeleton table (dropped via migration 0003).
//
// Match ownership (D-05): activity_uploads.matchedSessionId owns the match link.
// No back-reference column is added to training_sessions — avoids a second migration
// and keeps the sessions table stable.
//
// SET NULL rationale (D-04, D-05): deleting a planned session must NOT cascade-delete
// the ride record — the ride happened regardless. The match simply unlinks (null).
//
// IDOR guard: deleteActivityUpload and setUploadMatch use and() with both userId AND id
// (single call — Pitfall 4). See queries.ts.

export const activityUploads = pgTable(
  "activity_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id FK — required on every non-users table (D-01); cascade on user deletion
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Domain columns
    fileName: text("file_name").notNull(),
    startedAt: timestamp("started_at").notNull(),
    durationSec: integer("duration_sec").notNull(),
    // nullable — not all devices record power (Pitfall 3)
    avgPowerW: integer("avg_power_w"),
    // nullable — null when FTP is not set or avgPowerW is absent
    estimatedTss: integer("estimated_tss"),
    // FK to training_sessions — SET NULL so deleting a session unlinks but doesn't
    // delete the ride record (D-04, D-05)
    matchedSessionId: uuid("matched_session_id").references(
      () => trainingSessions.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("activity_uploads_user_id_idx").on(t.userId)]
);
