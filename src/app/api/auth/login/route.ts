/**
 * POST /api/auth/login — authenticate a user and set session cookie.
 *
 * Flow:
 *   1. Extract client IP from x-forwarded-for header
 *   2. Parse + validate body with loginSchema (Zod v4)
 *   3. Check BOTH rate limit axes (D-10, Pitfall 6):
 *        - ipLimiter.limit(ip)
 *        - emailLimiter.limit(email.toLowerCase())
 *      Block on EITHER failure.
 *   4. Look up user by email — always return generic error if not found (D-07)
 *   5. verifyPassword — always return same generic error if wrong (D-07)
 *   6. Set iron-session cookie { id, email } with 30-day maxAge (D-04, D-06)
 *
 * Route Handlers only — session.save() cannot run in RSC.
 *
 * Anti-enumeration: "Invalid email or password." is the ONLY error string
 * returned for wrong email OR wrong password. Never distinguish the two (D-07).
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { loginSchema, firstIssueMessage } from "@/lib/auth/schemas";
import { verifyPassword, DUMMY_HASH } from "@/lib/auth/password";
import { ipLimiter, emailLimiter } from "@/lib/ratelimit";

/** Single error string for all auth failures — never change (D-07). */
const AUTH_ERROR = "Invalid email or password.";

/** Rate limit error (D-10). */
const RATE_ERROR = "Too many attempts. Try again in a few minutes.";

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Extract client IP — use x-real-ip (Vercel sets this to the real client IP)
  // or the rightmost x-forwarded-for entry (Vercel appends the real IP last).
  // Never trust split(",")[0] — that's the client-controlled leftmost entry.
  const reqHeaders = await headers();
  const realIp = reqHeaders.get("x-real-ip");
  const forwarded = reqHeaders.get("x-forwarded-for");
  const ip = (
    realIp ??
    (forwarded ? forwarded.split(",").at(-1) : undefined) ??
    "unknown"
  ).trim();

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = loginSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: firstIssueMessage(result) },
      { status: 400 }
    );
  }

  const { email, password } = result.data;

  // 3. Dual-axis rate limiting — check BOTH, block on EITHER (D-10, Pitfall 6)
  const [ipResult, emailResult] = await Promise.all([
    ipLimiter.limit(ip),
    emailLimiter.limit(email.toLowerCase()),
  ]);

  if (!ipResult.success || !emailResult.success) {
    return NextResponse.json({ error: RATE_ERROR }, { status: 429 });
  }

  // 4. Look up user by email
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email));

  // 5. Verify password — always run bcrypt to prevent timing side-channel (T-1-03).
  // When no user is found, compare against DUMMY_HASH so response time matches
  // the existing-user branch. Never short-circuit here (D-07).
  const hashToCheck = rows.length > 0 ? rows[0].passwordHash : DUMMY_HASH;
  const passwordValid = await verifyPassword(password, hashToCheck);

  if (rows.length === 0) {
    return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
  }

  const user = rows[0];
  if (!passwordValid) {
    return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
  }

  // 6. Set iron-session cookie { id, email } (D-04, D-06)
  // 30-day maxAge is set in sessionOptions (src/lib/session.ts)
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.id = user.id;
  session.email = user.email;
  await session.save();

  return NextResponse.json({ ok: true });
}
