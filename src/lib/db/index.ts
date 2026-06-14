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
 *
 * Lazy initialization: neon() is called inside a getter to defer URL validation
 * until first use. This prevents module-level throws during Next.js build-time
 * static page collection when DATABASE_URL may not be available to Turbopack
 * worker subprocesses (Next.js 16 Turbopack build behavior).
 */
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | undefined;

/**
 * db — lazily initialized Neon HTTP client.
 *
 * Accesses DATABASE_URL on first use rather than at module evaluation time.
 * At request time (dev server / Vercel runtime), DATABASE_URL is always
 * available. At build time, Turbopack workers may not have env vars loaded.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    if (!_db) {
      // neon() creates an HTTP-based SQL client (no persistent TCP connection).
      // Required for Vercel serverless — works on cold starts without connection pools.
      const sql = neon(process.env.DATABASE_URL!);
      _db = drizzle(sql, { schema });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});
