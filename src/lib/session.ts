/**
 * iron-session config — single shared export (D-04, D-06).
 *
 * All server components, route handlers, and proxy.ts MUST import
 * sessionOptions from this file — never define cookie options inline.
 *
 * Usage in Route Handlers:
 *   const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
 *   session.id = user.id;
 *   session.email = user.email;
 *   await session.save();
 *
 * Usage in proxy.ts:
 *   const session = await getIronSession(request.cookies, sessionOptions);
 *   if (!session.id) return NextResponse.redirect(new URL("/login", request.url));
 */

// SessionData payload (D-04): minimal — id + email only.
// No role field: single user type in v1.
// Email included to avoid a DB round-trip for nav display.
export interface SessionData {
  id: string;
  email: string;
}

// Cookie options (D-06):
//   httpOnly: true  — inaccessible to client-side JavaScript
//   secure: true    — HTTPS-only (Vercel always serves HTTPS in production)
//   sameSite: "lax" — CSRF protection for same-origin forms (D-12)
//   maxAge: 30 days — persistent across browser sessions (AUTH-02)
export const sessionOptions = {
  cookieName: "pace-session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
  },
};
