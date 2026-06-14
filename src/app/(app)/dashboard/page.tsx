/**
 * Dashboard — protected page (AUTH-02, AUTH-03, PROF-03).
 *
 * Reads the session from iron-session to display the logged-in email (D-04:
 * email stored in cookie; no DB round-trip needed for nav display).
 *
 * Phase 2 additions (PROF-03):
 *   - Fetches user profile to show FTP-active vs RPE-mode status.
 *   - DASHBOARD_FTP_ACTIVE: substitutes the real watt value via .replace("{value}", ...).
 *   - DASHBOARD_FTP_ABSENT: shown when profile.ftp is null/undefined.
 *   - "Edit profile" link navigates to /profile.
 *
 * Logout form: POST to /api/auth/logout (AUTH-03). Using a form element ensures
 * logout works without JavaScript and is a standard HTML POST (SameSite=Lax CSRF
 * protection applies, D-12).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { findUserProfileByUserId } from "@/lib/db/queries";
import { COPY } from "@/lib/copy";
import { SessionGenerator } from "@/components/session/session-generator";

export default async function DashboardPage() {
  // Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints).
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.id) {
    redirect("/login");
  }

  // Fetch profile for FTP-active vs RPE-mode status (PROF-03)
  const profile = await findUserProfileByUserId(session.id);

  // Substitute real watt value into DASHBOARD_FTP_ACTIVE (never expose raw {value} token)
  const ftpStatus = profile?.ftp
    ? COPY.DASHBOARD_FTP_ACTIVE.replace("{value}", String(profile.ftp))
    : COPY.DASHBOARD_FTP_ABSENT;

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-8 pt-16">
      <div className="w-full max-w-lg space-y-6">
        {/* Welcome heading — 24px/600 (UI-SPEC §Screen 2) */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            {COPY.DASHBOARD_EMPTY_HEADING}
          </h1>
          <p className="text-sm text-muted-foreground">
            {COPY.DASHBOARD_EMPTY_BODY}
          </p>
        </div>

        {/* FTP status line — zone-active or RPE-mode (UI-SPEC §Screen 2 item 4) */}
        <p className="text-sm text-muted-foreground">{ftpStatus}</p>

        {/* Session generator — readiness tap-selector + generate button + result card (D-11, D-12) */}
        <SessionGenerator profile={profile} />

        {/* Edit profile link — navigates to /profile (UI-SPEC §Screen 2 item 5) */}
        <a
          href="/profile"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {COPY.DASHBOARD_LINK_EDIT_PROFILE}
        </a>

        {/* Signed-in email — informational */}
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{session.email}</span>
        </p>

        {/* Logout form — POST to /api/auth/logout (AUTH-03) */}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
