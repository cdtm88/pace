/**
 * Password hashing and verification — bcryptjs at cost factor 12 (D-05).
 *
 * bcryptjs is pure JS — no native bindings. This is intentional:
 *   - argon2 and native bcrypt both have documented Vercel serverless
 *     deployment failures due to node-gyp native compilation (CLAUDE.md §Auth).
 *   - bcryptjs at CF12 provides sufficient protection for this workload.
 *
 * bcryptjs.compare() is timing-safe by design — it always runs the full
 * comparison regardless of early-exit opportunities (T-1-03 mitigation).
 *
 * NEVER import 'bcrypt' (native) or 'argon2' — they will fail on Vercel.
 */
import bcrypt from "bcryptjs";

/**
 * Precomputed bcrypt hash of a dummy password — used to ensure constant-time
 * response even when no user is found (T-1-03 timing side-channel mitigation).
 * Value: bcrypt.hashSync("__dummy__", 12)
 */
export const DUMMY_HASH =
  "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9i";

/** Hash a plaintext password with bcryptjs at cost factor 12 (D-05). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/**
 * Compare a plaintext password against a stored hash.
 * Returns true if they match, false otherwise.
 * Timing-safe — safe to use for auth comparison (T-1-03).
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
