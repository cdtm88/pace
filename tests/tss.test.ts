/**
 * PROG-01: TSS estimation + intensity label utility coverage.
 * Tests null FTP fallback path, TSS math, and intensity label thresholds.
 */
import { describe, it, expect } from "vitest";
import { computeTSS, computeIntensityLabel } from "@/lib/training/tss";

describe("computeTSS", () => {
  it("returns null when ftp is null", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 1.0 }];
    expect(computeTSS(blocks, null)).toBeNull();
  });

  it("returns null when ftp is 0", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 1.0 }];
    expect(computeTSS(blocks, 0)).toBeNull();
  });

  it("returns null when totalSec across blocks is 0", () => {
    const blocks = [{ durationSec: 0, powerFraction: 1.0 }];
    expect(computeTSS(blocks, 250)).toBeNull();
  });

  it("returns null for empty blocks array", () => {
    expect(computeTSS([], 250)).toBeNull();
  });

  it("returns 100 for 3600s at powerFraction 1.0 (TSS = 3600 * 1^2 * 100 / 3600)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 1.0 }];
    expect(computeTSS(blocks, 250)).toBe(100);
  });

  it("weights IF by durationSec — 600s@0.5 + 600s@1.0 yields weightedIF=0.75; result=19", () => {
    const blocks = [
      { durationSec: 600, powerFraction: 0.5 },
      { durationSec: 600, powerFraction: 1.0 },
    ];
    // weightedIF = (0.5*600 + 1.0*600) / 1200 = 900/1200 = 0.75
    // TSS = Math.round(1200 * 0.75^2 * 100 / 3600) = Math.round(1200 * 0.5625 * 100 / 3600)
    //      = Math.round(67500 / 3600) = Math.round(18.75) = 19
    expect(computeTSS(blocks, 250)).toBe(19);
  });

  it("result is always an integer (Math.round applied)", () => {
    const blocks = [{ durationSec: 1800, powerFraction: 0.75 }];
    const tss = computeTSS(blocks, 250);
    expect(tss).not.toBeNull();
    expect(Number.isInteger(tss)).toBe(true);
  });

  it("handles multi-block sessions with different durations", () => {
    // 10 min warmup at 0.6, 30 min work at 0.9, 5 min cooldown at 0.5
    const blocks = [
      { durationSec: 600, powerFraction: 0.6 },
      { durationSec: 1800, powerFraction: 0.9 },
      { durationSec: 300, powerFraction: 0.5 },
    ];
    const totalSec = 2700;
    const weightedIF = (600 * 0.6 + 1800 * 0.9 + 300 * 0.5) / totalSec;
    const expected = Math.round((totalSec * weightedIF * weightedIF * 100) / 3600);
    expect(computeTSS(blocks, 250)).toBe(expected);
  });
});

describe("computeIntensityLabel", () => {
  it("returns null when ftp is set (TSS shown instead)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.7 }];
    expect(computeIntensityLabel(blocks, 250)).toBeNull();
  });

  it("returns null when ftp is a non-zero value", () => {
    const blocks = [{ durationSec: 600, powerFraction: 0.5 }];
    expect(computeIntensityLabel(blocks, 1)).toBeNull();
  });

  it("returns null when totalSec is 0", () => {
    const blocks = [{ durationSec: 0, powerFraction: 0.5 }];
    expect(computeIntensityLabel(blocks, null)).toBeNull();
  });

  it("returns null for empty blocks array", () => {
    expect(computeIntensityLabel([], null)).toBeNull();
  });

  it("returns Easy when avg powerFraction < 0.65", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.5 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Easy");
  });

  it("returns Easy when avg powerFraction is 0.64 (boundary below Moderate)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.64 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Easy");
  });

  it("returns Moderate when avg powerFraction is 0.65 (lower boundary)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.65 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Moderate");
  });

  it("returns Moderate when avg powerFraction is in [0.65, 0.80)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.72 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Moderate");
  });

  it("returns Moderate when avg powerFraction is 0.79 (just below Hard boundary)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.79 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Moderate");
  });

  it("returns Hard when avg powerFraction is 0.80 (boundary)", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.80 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Hard");
  });

  it("returns Hard when avg powerFraction is 0.90", () => {
    const blocks = [{ durationSec: 3600, powerFraction: 0.90 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Hard");
  });

  it("returns Hard when avg powerFraction is 1.0 (>= 0.95, open-ended — no fourth label)", () => {
    expect(computeIntensityLabel([{ durationSec: 600, powerFraction: 1.0 }], null)).toBe("Hard");
  });

  it("returns Hard when powerFraction >= 0.95 (D-10 clarification: upper bound is open)", () => {
    const blocks = [{ durationSec: 600, powerFraction: 1.2 }];
    expect(computeIntensityLabel(blocks, null)).toBe("Hard");
  });

  it("uses weighted average by durationSec for intensity label", () => {
    // 300s at 0.5 (Easy) + 300s at 0.8 (Hard boundary) = avgFraction 0.65 → Moderate
    const blocks = [
      { durationSec: 300, powerFraction: 0.5 },
      { durationSec: 300, powerFraction: 0.8 },
    ];
    expect(computeIntensityLabel(blocks, null)).toBe("Moderate");
  });
});
