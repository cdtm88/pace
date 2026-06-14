/**
 * proxy.ts — blanket auth redirect (D-08).
 *
 * Named proxy.ts NOT middleware.ts — renamed in Next.js 16 (CLAUDE.md Pitfall 2,
 * RESEARCH.md Pitfall 2). Using middleware.ts will be silently ignored on Vercel.
 *
 * Reads the iron-session cookie directly from the NextRequest cookies object.
 * getIronSession(request.cookies, sessionOptions) — no cookie-header fallback branch.
 * See: RESEARCH.md Pattern 5, CONTEXT.md D-08.
 */
import { NextRequest, NextResponse } from "next/server";
import { getIronSession, type SessionOptions } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

// iron-session CookieStore shape (from iron-session/dist/index.d.ts).
// Imported inline to avoid needing to re-export from iron-session's private types.
interface IronCookieStore {
  get: (name: string) => { name: string; value: string } | undefined;
  set: {
    (name: string, value: string, cookie?: Partial<{ domain: string; path: string; sameSite: boolean | "lax" | "strict" | "none"; secure: boolean; httpOnly: boolean; maxAge: number; expires: Date | number; priority: string }>): void;
    (options: { name: string; value: string }): void;
  };
}

/**
 * Routes that do NOT require authentication.
 * All other routes require a valid session.id (D-08).
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through public paths — no auth check needed.
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Read session from request cookies (iron-session v8, no cookie-header fallback).
  // getIronSession(request.cookies, sessionOptions) — RESEARCH.md Pattern 5.
  // Cast required: NextRequest.cookies.set() has an incompatible overload signature
  // vs iron-session's CookieStore.set(). In proxy.ts the session is ONLY READ (never
  // written), so the mismatch on the set() overload is irrelevant at runtime.
  const session = await getIronSession<SessionData>(
    request.cookies as unknown as IronCookieStore,
    sessionOptions as SessionOptions
  );

  // Redirect to /login when no session.id (unauthenticated, D-08).
  if (!session.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except Next.js static assets and image optimization paths.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
