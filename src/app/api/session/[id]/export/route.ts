/**
 * GET /api/session/[id]/export — download a Zwift-compatible .zwo file.
 *
 * Security contract:
 *   - userId is read exclusively from iron-session (never from query params or body)
 *     → prevents Spoofing (T-04-04)
 *   - Auth check precedes any DB access → unauthenticated requests receive 401
 *     before any session data is fetched (T-04-05)
 *   - IDOR guard: findTrainingSession(userId, id) uses and(eq(userId), eq(id)) →
 *     returns null when the session belongs to a different user; caller returns 404
 *     (never 403 — existence of a resource must not be revealed) (T-04-03)
 *   - XML injection: buildZwoXml applies xmlEscape() to title and notes before
 *     interpolation → prevents Tampering (T-04-06)
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { findTrainingSession } from "@/lib/db/queries";
import { buildZwoXml, sanitizeFilename } from "@/lib/training/zwo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Await params — Next.js 16: params is a Promise (Pitfall 1).
  const { id } = await params;

  // 2. Auth gate — read userId from iron-session; never from URL or body (T-04-04).
  const ironSession = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!ironSession.id) {
    // Data endpoint returns JSON error, not a redirect (matches Route Handler pattern).
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. IDOR guard — findTrainingSession uses and(eq(userId), eq(id)); returns null
  //    when the session does not exist OR belongs to a different user (T-04-03).
  const session = await findTrainingSession(ironSession.id, id);
  if (!session) {
    // 404, never 403 — IDOR policy: resource existence must not be revealed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 4. Build XML and return as file download.
  try {
    const xml = buildZwoXml(session);
    const safeName = sanitizeFilename(session.title);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}.zwo"`,
      },
    });
  } catch (err) {
    console.error("[export/route] XML build failed:", err);
    return NextResponse.json(
      { error: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
