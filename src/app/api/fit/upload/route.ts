/**
 * POST /api/fit/upload — FIT file ingestion Route Handler (D-01).
 *
 * Security contract:
 *   - userId is ALWAYS read from the iron-session cookie; NEVER from the form (T-05-04).
 *   - Unauthenticated requests are rejected with 401 before any parsing (T-05-04).
 *   - File size is checked BEFORE arrayBuffer() to avoid loading oversized files into
 *     memory (Pitfall 1 / T-05-05). Limit: 4MB (below Vercel's 4.5MB hard cap, D-02).
 *   - Non-FIT binaries that pass the size check are caught by parseFitFile and rejected
 *     with 400 invalid_fit_file (T-05-06 / D-09).
 *   - Parser and DB errors are caught and logged server-side only — generic error codes
 *     are returned to the client (T-05-08).
 *
 * Execution order (RESEARCH Pattern 2):
 *   1. Auth gate (401 on no session)
 *   2. Parse FormData, extract file (400 on missing_file, invalid_form_data)
 *   3. Size check before arrayBuffer (413 on file_too_large)
 *   4. Convert to Buffer and parse .fit file (400 on invalid_fit_file)
 *   5. Match parsed ride to a planned session (D-10 / D-11)
 *   6. Estimate TSS when avgPowerW and FTP are both present (D-08)
 *   7. Insert activityUploads row (userId from session — IDOR guard)
 *   8. Return JSON per interface_context
 *
 * IDOR references: D-01, D-02, D-08, D-09, D-10, D-11
 *
 * NOTE: This route uses Node.js runtime (not Edge) — fit-file-parser requires
 * Node Buffer. Do NOT add `export const runtime = 'edge'` here (RESEARCH anti-pattern).
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { parseFitFile } from '@/lib/fit/parse';
import { matchActivity, type MatchableSession } from '@/lib/fit/match';
import { estimateRideTSS } from '@/lib/fit/tss';
import {
  listTrainingSessions,
  findUserProfileByUserId,
  insertActivityUpload,
} from '@/lib/db/queries';

/** 4MB limit — below Vercel's 4.5MB hard cap (D-02 / Pitfall 1) */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Auth gate — userId from session only, never from the form (T-05-04)
  //    await cookies() is mandatory in Next.js 16 (CLAUDE.md constraint)
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = session.id;

  // 2. Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  // 3. Size check BEFORE arrayBuffer() — avoids loading oversized file into memory (Pitfall 1 / T-05-05)
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  // 4. Convert to Buffer and parse .fit file
  const buffer = Buffer.from(await file.arrayBuffer());
  let fit: Awaited<ReturnType<typeof parseFitFile>>;
  try {
    fit = await parseFitFile(buffer);
  } catch {
    // D-09: invalid FIT binary → 400; never leak parser internals to client (T-05-08)
    return NextResponse.json({ error: 'invalid_fit_file' }, { status: 400 });
  }

  try {
    // 5. Match parsed ride to a planned session (D-10 / D-11)
    //    Map DB rows to MatchableSession — totalDurationSec is the planned duration field
    const dbSessions = await listTrainingSessions(userId);
    const matchableSessions: MatchableSession[] = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      totalDurationSec: s.totalDurationSec,
    }));
    const match = matchActivity(fit, matchableSessions);

    // 6. Estimate TSS when avgPowerW and FTP are both present (D-08)
    //    null when avgPowerW is absent or user has not set their FTP
    const profile = await findUserProfileByUserId(userId);
    const estimatedTss =
      fit.avgPowerW !== null && profile?.ftp
        ? estimateRideTSS(fit.durationSec, fit.avgPowerW, profile.ftp)
        : null;

    // 7. Insert activity_uploads row (userId always from session — IDOR guard)
    const row = await insertActivityUpload({
      userId,
      fileName: file.name,
      startedAt: fit.startedAt,
      durationSec: fit.durationSec,
      avgPowerW: fit.avgPowerW,
      estimatedTss,
      matchedSessionId: match?.id ?? null,
    });

    if (!row) {
      console.error('[fit/upload] insertActivityUpload returned null');
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
    }

    // 8. Return JSON per interface_context
    return NextResponse.json({
      id: row.id,
      fileName: row.fileName,
      startedAt: row.startedAt,
      durationSec: row.durationSec,
      avgPowerW: row.avgPowerW,
      estimatedTss: row.estimatedTss,
      matchedSessionId: row.matchedSessionId,
      matchedSessionTitle: match?.title ?? null,
    });
  } catch (err) {
    // Generic 500 — log server-side, never return DB/parser internals (T-05-08)
    console.error('[fit/upload] unexpected error:', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
