/**
 * Wave 3 scaffold: buildWeeklyTSS tests.
 * These are pending placeholders — buildWeeklyTSS is implemented in Wave 3.
 * Convert it.todo() → real tests when src/lib/fit/tss-chart-data.ts is implemented.
 *
 * D-14: 6-week rolling window, one entry per ISO week, recharts BarChart data shape
 * D-15: Empty state when no matched uploads exist
 */
import { describe, it } from "vitest";

describe("buildWeeklyTSS", () => {
  it.todo("returns 6 entries covering the last 6 ISO weeks");
  it.todo("sums estimatedTss for uploads in the same ISO week");
  it.todo("returns zero for weeks with no matched uploads");
  it.todo("only includes uploads with matchedSessionId set (matched uploads only)");
  it.todo("returns entries in chronological order (oldest first)");
});
