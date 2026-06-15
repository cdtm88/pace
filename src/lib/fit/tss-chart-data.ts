/**
 * buildWeeklyTSS — 6-week rolling TSS aggregator (D-14).
 *
 * Produces exactly 6 Monday-anchored week buckets (oldest → newest).
 * Only matched uploads (matchedSessionId !== null) with a non-null estimatedTss
 * contribute to the sum. Week labels are formatted as "Jun 9" (en-US, short month).
 *
 * Used by the dashboard RSC to pass chart data to TssChart (D-14, PROG-02).
 */

export interface WeeklyTSSPoint {
  /** "Jun 9" — Monday of the week, en-US short format */
  week: string;
  tss: number;
}

export interface UploadForChart {
  startedAt: Date;
  estimatedTss: number | null;
  matchedSessionId: string | null;
}

/**
 * Return the Monday of the week containing `date`, offset by `weekOffset` full weeks.
 * weekOffset=0 → current week's Monday, weekOffset=-1 → last week's Monday, etc.
 */
function getMonday(date: Date, weekOffset: number): Date {
  const d = new Date(date);
  // JS day: 0=Sun, 1=Mon … 6=Sat. Monday is day 1.
  const dayOfWeek = d.getDay(); // 0–6
  // Shift to Monday: if Sunday (0) treat as 7 so we go back 6 days, not forward 1.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysToMonday + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build exactly 6 Monday-anchored week buckets covering the 6 weeks ending this week.
 * Bucket 0 is the oldest (5 weeks ago), bucket 5 is the current week.
 */
export function buildWeeklyTSS(uploads: UploadForChart[]): WeeklyTSSPoint[] {
  const now = new Date();

  // Build the 6 week-start Mondays (oldest first)
  const weekStarts: Date[] = [];
  for (let i = -5; i <= 0; i++) {
    weekStarts.push(getMonday(now, i));
  }

  return weekStarts.map((weekStart, idx) => {
    const weekEnd =
      idx < weekStarts.length - 1
        ? weekStarts[idx + 1]
        : new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const label = weekStart.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const tss = uploads.reduce((sum, u) => {
      if (
        u.matchedSessionId === null ||
        u.estimatedTss === null ||
        u.startedAt < weekStart ||
        u.startedAt >= weekEnd
      ) {
        return sum;
      }
      return sum + u.estimatedTss;
    }, 0);

    return { week: label, tss };
  });
}
