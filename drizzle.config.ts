/**
 * drizzle-kit configuration.
 *
 * IMPORTANT — uses DATABASE_URL_UNPOOLED (not DATABASE_URL):
 * Migrations must run against the direct (non-pooled) Neon connection.
 * PgBouncer (the Neon pooler) doesn't support all transaction semantics
 * that drizzle-kit requires for DDL operations.
 * See: CONTEXT.md D-02, RESEARCH.md Pitfall 4
 *
 * Run migrations at deploy time:
 *   DATABASE_URL_UNPOOLED=<direct-url> npx drizzle-kit generate
 *   DATABASE_URL_UNPOOLED=<direct-url> npx drizzle-kit migrate
 */
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
} satisfies Config;
