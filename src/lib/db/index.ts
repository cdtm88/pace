/**
 * Neon HTTP client — pooled DATABASE_URL (D-02).
 *
 * DATABASE_URL is the POOLED connection string injected by the Neon Vercel
 * Marketplace integration. Use this for all app queries.
 *
 * DATABASE_URL_UNPOOLED is used ONLY by drizzle-kit for migrations (see
 * drizzle.config.ts). Never use UNPOOLED at app runtime — PgBouncer pooler
 * does not support all transaction semantics required at runtime.
 *
 * IDOR guard (D-03): All user-scoped queries must use:
 *   .where(and(eq(table.userId, session.id), eq(table.id, requestedId)))
 * Never chain .where().where() — Drizzle silently drops the first condition.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// neon() creates an HTTP-based SQL client (no persistent TCP connection).
// Required for Vercel serverless — works on cold starts without connection pools.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
