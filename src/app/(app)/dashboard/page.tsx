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
 * Phase 5 additions (UPLOAD-01/02/03, PROG-02):
 *   - Fetches activity uploads for the authenticated user (findActivityUploadsByUserId).
 *   - buildWeeklyTSS: 6-week rolling TSS chart data built server-side (D-14).
 *   - "Log a Ride" card: UploadFitButton for .fit upload (D-12).
 *   - "Training load" card: TssChart with server-built chart data (D-14, D-15).
 *   - Both cards are positioned below the session generator / "View session" link
 *     and above the "Edit profile" / sign-out area (D-12).
 *
 * Logout form: POST to /api/auth/logout (AUTH-03). Using a form element ensures
 * logout works without JavaScript and is a standard HTML POST (SameSite=Lax CSRF
 * protection applies, D-12).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  findUserProfileByUserId,
  findLatestSessionByUserId,
  findActivityUploadsByUserId,
} from "@/lib/db/queries";
import { buildWeeklyTSS } from "@/lib/fit/tss-chart-data";
import { COPY } from "@/lib/copy";
import { SessionGenerator } from "@/components/session/session-generator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { TssChart } from "@/components/fit/tss-chart";
import { UploadFitButton } from "@/components/fit/upload-fit-button";

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

  // Fetch latest session for "View session" re-entry link (D-03); null for new users.
  const latestSession = await findLatestSessionByUserId(session.id);

  // Phase 5: fetch uploads for chart + delete list (T-05-09: scoped to session.id only)
  const uploads = await findActivityUploadsByUserId(session.id);

  // Build 6-week rolling TSS chart data server-side (D-14, PROG-02)
  const weeklyTSS = buildWeeklyTSS(
    uploads.map((u) => ({
      startedAt: u.startedAt,
      estimatedTss: u.estimatedTss,
      matchedSessionId: u.matchedSessionId,
    }))
  );

  // Build recent uploads list for UploadFitButton delete UI
  // matchedSessionTitle: passing null is acceptable — the inline post-upload
  // confirmation is the authoritative match display (D-13). No extra query needed.
  const recentUploads = uploads.map((u) => ({
    id: u.id,
    fileName: u.fileName,
    matchedSessionTitle: null as string | null,
  }));

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

        {/* View session link — shown only when a session exists (D-03, Pitfall 5) */}
        {latestSession && (
          <a
            href={`/session/${latestSession.id}`}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COPY.SESSION_DASHBOARD_VIEW_LINK}
          </a>
        )}

        {/* Log a Ride card — .fit file upload (D-12, UPLOAD-01/02/03) */}
        <Card>
          <CardHeader>
            <CardTitle>{COPY.UPLOAD_CARD_TITLE}</CardTitle>
            <CardDescription>{COPY.UPLOAD_CARD_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadFitButton recentUploads={recentUploads} />
          </CardContent>
        </Card>

        {/* Training load card — 6-week TSS chart (D-14, D-15, PROG-02) */}
        <Card>
          <CardHeader>
            <CardTitle>{COPY.CHART_TSS_TITLE}</CardTitle>
            <CardDescription>{COPY.CHART_TSS_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            <TssChart data={weeklyTSS} />
          </CardContent>
        </Card>

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
