/**
 * Session RSC page — auth-gates, enforces IDOR, computes TSS/intensity server-side.
 *
 * Security contract:
 *   1. Auth check runs BEFORE any resource lookup — unauthenticated users are
 *      redirected to /login without revealing whether a session id exists (T-04-09).
 *   2. findTrainingSession(userId, id) uses and() to scope the row to the requesting
 *      user — notFound() on null returns 404, never 403 (T-04-07).
 *   3. TSS and intensity are computed server-side from the stored blocks and FTP.
 *      These derived values are passed as props; rawJson is never forwarded (T-04-08).
 */
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  findTrainingSession,
  findUserProfileByUserId,
} from "@/lib/db/queries";
import { computeTSS, computeIntensityLabel } from "@/lib/training/tss";
import type { GeneratedSession } from "@/lib/db/schemas/session";
import { SessionDetail } from "@/components/session/session-detail";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16: params is a Promise — must await (CLAUDE.md §Critical Version Constraints).
  const { id } = await params;

  // 1. Auth gate — read session BEFORE any resource lookup (T-04-09).
  const ironSession = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!ironSession.id) {
    redirect("/login");
  }

  // 2. IDOR-safe fetch — and() guard inside findTrainingSession; notFound() on null (T-04-07).
  const session = await findTrainingSession(ironSession.id, id);
  if (!session) notFound(); // 404 not 403 — IDOR policy

  // 3. Defensive blocks cast — jsonb is typed as unknown in Drizzle; validate shape.
  if (!Array.isArray(session.blocks)) notFound();
  const blocks = session.blocks as GeneratedSession["blocks"];

  // 4. Fetch profile for FTP (RPE fallback when absent — PROG-01).
  const profile = await findUserProfileByUserId(ironSession.id);
  const ftp = profile?.ftp ?? null;

  // 5. Server-side TSS / intensity computation — never re-derived client-side (T-04-08).
  const tss = computeTSS(blocks, ftp);
  const intensity = computeIntensityLabel(blocks, ftp);

  return (
    <SessionDetail
      session={session}
      blocks={blocks}
      ftp={ftp}
      tss={tss}
      intensity={intensity}
    />
  );
}
