/**
 * POST /api/auth/logout — destroy the session and redirect to /login.
 *
 * AUTH-03: Logout destroys the session, clears the iron-session cookie, and
 * redirects the user to /login.
 *
 * Route Handler only — session.destroy() cannot run in RSC.
 * await cookies() is mandatory in Next.js 16 (Pitfall 3).
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";

export async function POST(): Promise<never> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  await session.destroy();
  redirect("/login");
}
