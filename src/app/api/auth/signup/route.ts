/**
 * POST /api/auth/signup — create a new user account.
 *
 * Flow:
 *   1. Parse + validate body with signupSchema (Zod v4)
 *   2. Check SIGNUP_ENABLED gate with first-user bypass (D-11)
 *   3. Hash password with bcryptjs CF12 (D-05)
 *   4. INSERT user; catch unique violation for duplicate email (Pitfall 5)
 *   5. Set iron-session cookie { id, email } (D-04, D-06)
 *
 * Route Handlers only — session.save() cannot run in RSC (Architectural
 * Responsibility Map).
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import { count } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { signupSchema, firstIssueMessage } from "@/lib/auth/schemas";
import { hashPassword } from "@/lib/auth/password";
import { ipLimiter } from "@/lib/ratelimit";

const RATE_ERROR = "Too many attempts. Try again in a few minutes.";

export async function POST(req: Request): Promise<NextResponse> {
  // 0. Rate limiting — prevent account creation floods (same IP extraction as login)
  const reqHeaders = await headers();
  const realIp = reqHeaders.get("x-real-ip");
  const forwarded = reqHeaders.get("x-forwarded-for");
  const ip = (
    realIp ??
    (forwarded ? forwarded.split(",").at(-1) : undefined) ??
    "unknown"
  ).trim();

  const ipResult = await ipLimiter.limit(ip);
  if (!ipResult.success) {
    return NextResponse.json({ error: RATE_ERROR }, { status: 429 });
  }

  // 1. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = signupSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: firstIssueMessage(result) },
      { status: 400 }
    );
  }

  const { email, password } = result.data;

  // 2. SIGNUP_ENABLED gate with first-user bypass (D-11)
  const signupEnabled = process.env.SIGNUP_ENABLED === "true";
  const countResult = await db.select({ count: count() }).from(users);
  const isFirstUser = countResult[0].count === 0;

  if (!signupEnabled && !isFirstUser) {
    return NextResponse.json(
      { error: "Registration is not open." },
      { status: 403 }
    );
  }

  // 3. Hash password at cost factor 12 (D-05)
  const passwordHash = await hashPassword(password);

  // 4. INSERT user; catch unique constraint violation for duplicate email (Pitfall 5)
  let userId: string;
  let userEmail: string;
  try {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    if (!inserted || inserted.length === 0) {
      return NextResponse.json(
        { error: "Could not create account. Please try again." },
        { status: 500 }
      );
    }
    userId = inserted[0].id;
    userEmail = inserted[0].email;
  } catch (err: unknown) {
    // Unique constraint violation (Pitfall 5: race condition on first-user or duplicate email)
    const isUniqueViolation =
      err instanceof Error &&
      (err.message.includes("unique") ||
        err.message.includes("duplicate") ||
        (err as unknown as Record<string, unknown>)["code"] === "23505");
    if (isUniqueViolation) {
      // Return 200 with ok:true — do not reveal whether the email is registered.
      // This prevents account enumeration via signup (D-07 applies to signup too).
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    throw err;
  }

  // 5. Set iron-session cookie (D-04, D-06)
  // await cookies() is mandatory in Next.js 16 (Pitfall 3)
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  session.id = userId;
  session.email = userEmail;
  await session.save();

  return NextResponse.json({ ok: true });
}
