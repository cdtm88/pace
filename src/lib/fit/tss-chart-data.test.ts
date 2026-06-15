/**
 * buildWeeklyTSS tests (D-14, PROG-02).
 * Dates are computed relative to new Date() so tests stay stable over time.
 */
import { describe, it, expect } from "vitest";
import { buildWeeklyTSS, type UploadForChart } from "./tss-chart-data";

/** Return a Date for `daysAgo` days before now */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe("buildWeeklyTSS", () => {
  it("returns 6 entries covering the last 6 ISO weeks", () => {
    const result = buildWeeklyTSS([]);
    expect(result).toHaveLength(6);
  });

  it("returns entries in chronological order (oldest first)", () => {
    const result = buildWeeklyTSS([]);
    // The last label differs from the first (different week Mondays)
    expect(result[0].week).not.toEqual(result[5].week);
  });

  it("returns zero for weeks with no matched uploads", () => {
    const result = buildWeeklyTSS([]);
    const total = result.reduce((s, p) => s + p.tss, 0);
    expect(total).toBe(0);
  });

  it("sums estimatedTss for a matched upload in the current week (bucket 5)", () => {
    const uploads: UploadForChart[] = [
      {
        startedAt: daysAgo(0), // today — always within the current Mon–Sun bucket
        estimatedTss: 64,
        matchedSessionId: "session-abc",
      },
    ];
    const result = buildWeeklyTSS(uploads);
    // Current week is the last bucket (index 5)
    expect(result[5].tss).toBe(64);
  });

  it("only includes uploads with matchedSessionId set (matched uploads only)", () => {
    const uploads: UploadForChart[] = [
      {
        startedAt: daysAgo(0),
        estimatedTss: 80,
        matchedSessionId: null, // unmatched — must not count
      },
    ];
    const result = buildWeeklyTSS(uploads);
    const total = result.reduce((s, p) => s + p.tss, 0);
    expect(total).toBe(0);
  });

  it("excludes uploads with estimatedTss=null", () => {
    const uploads: UploadForChart[] = [
      {
        startedAt: daysAgo(0),
        estimatedTss: null,
        matchedSessionId: "session-xyz",
      },
    ];
    const result = buildWeeklyTSS(uploads);
    const total = result.reduce((s, p) => s + p.tss, 0);
    expect(total).toBe(0);
  });

  it("excludes uploads older than 6 weeks", () => {
    const uploads: UploadForChart[] = [
      {
        startedAt: daysAgo(43), // > 6 weeks ago
        estimatedTss: 100,
        matchedSessionId: "session-old",
      },
    ];
    const result = buildWeeklyTSS(uploads);
    const total = result.reduce((s, p) => s + p.tss, 0);
    expect(total).toBe(0);
  });
});
