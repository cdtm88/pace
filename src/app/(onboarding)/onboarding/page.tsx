/**
 * OnboardingPage — /onboarding RSC shell (UI-SPEC Screen 1).
 *
 * Gate: session.id only (NOT onboardingComplete) — this IS the onboarding page.
 * Checking onboardingComplete here would create a redirect loop with (app)/layout.tsx
 * (Pitfall 1: loop prevention — RESEARCH.md Pattern 6).
 *
 * Route group: (onboarding) — no layout.tsx in this group, so it is NOT subject
 * to the (app) layout's onboardingComplete gate. This is intentional — the route
 * group boundary prevents the loop.
 *
 * /onboarding is NOT in proxy.ts PUBLIC_PATHS — logged-out users are sent to /login.
 * Authenticated users reach this page and see the wizard without looping.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  // Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints)
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  // Session-only gate — do NOT check onboardingComplete here (Pitfall 1 loop prevention)
  if (!session.id) {
    redirect("/login");
  }

  return <OnboardingWizard />;
}
