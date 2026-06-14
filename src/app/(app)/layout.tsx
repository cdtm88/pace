/**
 * Protected RSC layout — (app) route group (D-08).
 *
 * Reads the iron-session cookie via getIronSession(await cookies(), sessionOptions).
 * Two-stage gate (T-02-06):
 *   1. !session.id → redirect to /login (unauthenticated)
 *   2. !profile || !profile.onboardingComplete → redirect to /onboarding (new user)
 *
 * proxy.ts handles the blanket /login redirect before the page renders; this layout
 * adds the onboarding gate so unboarded users are sent to /onboarding instead of
 * landing on the app prematurely.
 *
 * CRITICAL — Pitfall 1 loop prevention:
 *   This gate MUST only live in (app)/layout.tsx, NEVER in (onboarding)/onboarding/page.tsx.
 *   If (onboarding) also checked onboardingComplete, an unboarded user would loop:
 *   /onboarding → check → redirect /onboarding → check → ...
 *   The (onboarding) route group has no layout.tsx; it is outside (app) and exempt.
 *
 * NOTE: session.save() and session.destroy() are ONLY in Route Handlers.
 * Never call session.save() in an RSC layout (RESEARCH.md §Architecture Responsibility Map).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findUserProfileByUserId } from "@/lib/db/queries";

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

  // Gate 1: Belt-and-suspenders auth check — proxy.ts should have already redirected.
  if (!session.id) {
    redirect("/login");
  }

  // Gate 2: Onboarding redirect (T-02-06) — new users must complete wizard before app.
  // ONLY in (app) layout — never in (onboarding) page (Pitfall 1 loop prevention).
  const profile = await findUserProfileByUserId(session.id);
  if (!profile || !profile.onboardingComplete) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
