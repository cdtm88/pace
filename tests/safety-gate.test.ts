/**
 * Safety gate assertions (D-04 deterministic checks).
 *
 * Implements: GEN-02 (physiological safety validation)
 * See: CONTEXT.md D-04; 03-PATTERNS.md safety-gate.ts analog
 *
 * The safety gate runs AFTER Zod parse (D-09 execution order).
 * Reason strings are server-log only — never surfaced to users.
 */
import { describe, it, expect } from "vitest";
import { validateSessionSafety } from "@/lib/safety-gate";
import type { GeneratedSession } from "@/lib/db/schemas/session";

const makeBlock = (
  order: number,
  type: "warmup" | "work" | "rest" | "cooldown",
  powerFraction: number
) => ({
  order,
  type,
  durationSec: 600,
  powerFraction,
  targetWatts: Math.round(powerFraction * 200),
  rpe: "Moderate" as const,
  description: "Test block",
});

const validSession: GeneratedSession = {
  title: "Test Session",
  totalDurationSec: 2700,
  blocks: [
    makeBlock(1, "warmup", 0.55),
    makeBlock(2, "work", 0.9),
    makeBlock(3, "cooldown", 0.5),
  ],
};

describe("validateSessionSafety", () => {
  it("returns { safe: true } for a valid 3-block session", () => {
    const result = validateSessionSafety(validSession);
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns safe: false when any block has powerFraction: 1.6 (> 1.5 gate ceiling)", () => {
    const session: GeneratedSession = {
      ...validSession,
      blocks: [
        makeBlock(1, "warmup", 0.55),
        makeBlock(2, "work", 1.6),  // exceeds 1.5 safety gate (Zod allows up to 1.8)
        makeBlock(3, "cooldown", 0.5),
      ],
    };
    const result = validateSessionSafety(session);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns safe: false for 4 consecutive work blocks with no rest/cooldown between", () => {
    const session: GeneratedSession = {
      ...validSession,
      totalDurationSec: 4800,
      blocks: [
        makeBlock(1, "work", 0.85),
        makeBlock(2, "work", 0.85),
        makeBlock(3, "work", 0.85),
        makeBlock(4, "work", 0.85),  // 4th consecutive work block — exceeds limit of 3
      ],
    };
    const result = validateSessionSafety(session);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns safe: true for 3 consecutive work blocks broken by a rest block (boundary)", () => {
    const session: GeneratedSession = {
      ...validSession,
      totalDurationSec: 3600,
      blocks: [
        makeBlock(1, "work", 0.85),
        makeBlock(2, "work", 0.85),
        makeBlock(3, "work", 0.85),  // exactly 3 consecutive — allowed
        makeBlock(4, "rest", 0.4),
        makeBlock(5, "work", 0.85),
      ],
    };
    const result = validateSessionSafety(session);
    expect(result.safe).toBe(true);
  });

  it("returns safe: false for a session with only 1 block (blocks.length < 2)", () => {
    const session: GeneratedSession = {
      ...validSession,
      totalDurationSec: 600,
      blocks: [makeBlock(1, "warmup", 0.55)],
    };
    const result = validateSessionSafety(session);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns safe: false for totalDurationSec > 14400 (defense-in-depth)", () => {
    const session: GeneratedSession = {
      ...validSession,
      totalDurationSec: 14401,
    };
    const result = validateSessionSafety(session);
    expect(result.safe).toBe(false);
  });
});
