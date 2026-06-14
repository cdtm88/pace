/**
 * Protected RSC layout — (app) route group (D-08).
 *
 * Reads the iron-session cookie via getIronSession(await cookies(), sessionOptions).
 * Redirects to /login when no session.id (belt-and-suspenders alongside proxy.ts).
 *
 * proxy.ts handles the blanket redirect before the page renders; this layout
 * provides session data for RSC children (nav display, data fetching) without
 * a DB round-trip (email is stored in the cookie per D-04).
 *
 * NOTE: session.save() and session.destroy() are ONLY in Route Handlers.
 * Never call session.save() in an RSC layout (RESEARCH.md §Architecture Responsibility Map).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints).
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  // Belt-and-suspenders: proxy.ts should have already redirected, but guard here too.
  if (!session.id) {
    redirect("/login");
  }

  return <>{children}</>;
}
