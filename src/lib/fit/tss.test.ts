/**
 * Tests for estimateRideTSS — pure function for actual ride TSS.
 * D-08: TSS from actual ride data (durationSec, avgPowerW, FTP).
 * Formula: TSS = (durationSec × IF² × 100) / 3600, IF = avgPowerW / ftp
 */
import { describe, it, expect } from "vitest";
import { estimateRideTSS } from "./tss";

describe("estimateRideTSS", () => {
  it("computes TSS for 1h ride at 80% FTP (IF=0.8)", () => {
    // IF = 200/250 = 0.8; TSS = round(3600 * 0.64 * 100 / 3600) = 64
    expect(estimateRideTSS(3600, 200, 250)).toBe(64);
  });

  it("computes TSS for 30min ride at FTP (IF=1.0)", () => {
    // IF = 250/250 = 1.0; TSS = round(1800 * 1 * 100 / 3600) = 50
    expect(estimateRideTSS(1800, 250, 250)).toBe(50);
  });

  it("computes TSS for 2h ride at 90% FTP (IF=0.9)", () => {
    // IF = 0.9; TSS = round(7200 * 0.81 * 100 / 3600) = round(162) = 162
    expect(estimateRideTSS(7200, 225, 250)).toBe(162);
  });

  it("returns 0 for zero duration", () => {
    expect(estimateRideTSS(0, 200, 250)).toBe(0);
  });
});
