/**
 * Profile edit page — RSC route (PROF-02).
 *
 * Fetches the existing profile via findUserProfileByUserId and passes it to
 * ProfileForm for pre-population. On form submission the shared saveProfileAction
 * upserts the row (no duplicate) and redirects to /dashboard.
 *
 * Security (T-02-01, T-02-04):
 *   - Session gate: redirect to /login if not authenticated.
 *   - The (app) layout additionally enforces onboardingComplete.
 *   - Profile is fetched by session.id — no IDOR risk.
 *
 * Profile null case: The (app) layout gate ensures only onboarded users reach
 * this page (they have a profile row). Pass null defensively — ProfileForm
 * renders empty defaultValues correctly.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findUserProfileByUserId } from "@/lib/db/queries";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  // Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints).
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.id) {
    redirect("/login");
  }

  const profile = await findUserProfileByUserId(session.id);

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-8 pt-16">
      <div className="w-full max-w-lg space-y-4">
        {/* Back link — text-sm font-medium (UI-SPEC §Screen 3) */}
        <a
          href="/dashboard"
          className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Dashboard
        </a>

        <ProfileForm
          existing={
            profile
              ? {
                  goals: profile.goals ?? "",
                  injuries: profile.injuries ?? "",
                  ftp: profile.ftp ?? undefined,
                  weight: profile.weight ?? undefined,
                }
              : null
          }
        />
      </div>
    </main>
  );
}
