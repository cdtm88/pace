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
import { pgTable, uuid, text, timestamp, index, integer, real, boolean } from "drizzle-orm/pg-core";

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
// Phase 3 adds session content columns via migration:
//   title text, zwoXml text, powerFraction real, durationSec integer, etc.

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id FK — required on every non-users table (D-01)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("training_sessions_user_id_idx").on(t.userId)]
);

// ── strava_connections ────────────────────────────────────────────────────────
// Phase 5 adds Strava token columns via migration:
//   stravaAthleteId bigint, accessToken text (encrypted), refreshToken text (encrypted),
//   expiresAt integer, etc.
// userId is additionally .unique() — one Strava connection per user.

export const stravaConnections = pgTable(
  "strava_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id FK — required on every non-users table (D-01)
    // .unique() enforces one-connection-per-user at the DB level
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("strava_connections_user_id_idx").on(t.userId)]
);
