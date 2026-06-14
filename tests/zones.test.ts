/**
 * PROF-03: Coggan zone utility coverage.
 * Tests null FTP fallback path and watt-boundary math.
 */
import { describe, it, expect } from "vitest";
import { computeZones, getZoneForWatts } from "@/lib/training/zones";

describe("computeZones", () => {
  it("returns null for null ftp", () => {
    expect(computeZones(null)).toBeNull();
  });

  it("returns null for undefined ftp", () => {
    expect(computeZones(undefined)).toBeNull();
  });

  it("returns null for 0 ftp", () => {
    expect(computeZones(0)).toBeNull();
  });

  it("returns array of 7 zones for ftp=200", () => {
    const zones = computeZones(200);
    expect(zones).not.toBeNull();
    expect(zones!.length).toBe(7);
  });

  it("Z1 (Active Recovery) has minWatts=0 and maxWatts=110 at ftp=200", () => {
    const zones = computeZones(200)!;
    const z1 = zones[0];
    expect(z1.zone).toBe(1);
    expect(z1.minWatts).toBe(0);
    expect(z1.maxWatts).toBe(110); // Math.round(200 * 0.55)
  });

  it("Z4 (Threshold) has correct watt bounds at ftp=200", () => {
    const zones = computeZones(200)!;
    const z4 = zones[3];
    expect(z4.zone).toBe(4);
    expect(z4.minWatts).toBe(182); // Math.round(200 * 0.91)
    expect(z4.maxWatts).toBe(210); // Math.round(200 * 1.05)
  });

  it("Z7 (Neuromuscular Power) has maxWatts=null", () => {
    const zones = computeZones(200)!;
    const z7 = zones[6];
    expect(z7.zone).toBe(7);
    expect(z7.maxWatts).toBeNull();
  });
});

describe("getZoneForWatts", () => {
  it("returns null when ftp is null", () => {
    expect(getZoneForWatts(100, null)).toBeNull();
  });

  it("returns null when ftp is undefined", () => {
    expect(getZoneForWatts(100, undefined)).toBeNull();
  });

  it("returns Z2 Endurance for 150W at ftp=200 (150/200=0.75 = Z2 upper bound)", () => {
    const zone = getZoneForWatts(150, 200);
    expect(zone).not.toBeNull();
    expect(zone!.label).toBe("Z2");
    expect(zone!.name).toBe("Endurance");
  });
});
