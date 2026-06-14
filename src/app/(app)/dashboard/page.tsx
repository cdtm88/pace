/**
 * Dashboard — protected page (AUTH-02, AUTH-03).
 *
 * Reads the session from iron-session to display the logged-in email (D-04:
 * email stored in cookie; no DB round-trip needed for nav display).
 *
 * Logout form: POST to /api/auth/logout (AUTH-03). Using a form element ensures
 * logout works without JavaScript and is a standard HTML POST (SameSite=Lax CSRF
 * protection applies, D-12).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export default async function DashboardPage() {
  // Next.js 16: cookies() is async — must await (CLAUDE.md §Critical Version Constraints).
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.id) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{session.email}</span>
          </p>
        </div>

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
