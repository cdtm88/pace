/**
 * Session Zod schema assertions (D-03 bounds enforcement).
 *
 * Implements: GEN-02 (AI output validation)
 * See: CONTEXT.md D-03; 03-PATTERNS.md session.ts analog
 *
 * Zod v4: error.issues (not .errors) — CLAUDE.md breaking change note.
 */
import { describe, it, expect } from "vitest";
import { GeneratedSessionSchema, SessionBlockSchema } from "@/lib/db/schemas/session";

const validBlock = {
  order: 1,
  type: "work" as const,
  durationSec: 1200,
  powerFraction: 0.85,
  targetWatts: 255,
  rpe: "Hard" as const,
  description: "Sustained threshold effort",
};

const validSession = {
  title: "Threshold Ladder 45 min",
  notes: "Focus on cadence 90+",
  totalDurationSec: 2700,
  blocks: [
    { ...validBlock, order: 1, type: "warmup" as const, durationSec: 600, powerFraction: 0.55, targetWatts: 165, rpe: "Easy" as const, description: "Easy spin to loosen up" },
    { ...validBlock, order: 2, type: "work" as const, durationSec: 1800, powerFraction: 0.9, targetWatts: 270, rpe: "Hard" as const, description: "Threshold work interval" },
    { ...validBlock, order: 3, type: "cooldown" as const, durationSec: 300, powerFraction: 0.5, targetWatts: 150, rpe: "Easy" as const, description: "Gentle cooldown" },
  ],
};

describe("GeneratedSessionSchema", () => {
  it("accepts a valid session with warmup + work + cooldown blocks", () => {
    const result = GeneratedSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it("rejects a block with powerFraction: 2.0 (> 1.8 max)", () => {
    const session = {
      ...validSession,
      blocks: [{ ...validSession.blocks[0], powerFraction: 2.0 }],
    };
    const result = GeneratedSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it("rejects a block with powerFraction: 0.05 (< 0.1 min)", () => {
    const session = {
      ...validSession,
      blocks: [{ ...validSession.blocks[0], powerFraction: 0.05 }],
    };
    const result = GeneratedSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it("rejects a session missing the title field", () => {
    const { title: _title, ...sessionWithoutTitle } = validSession;
    const result = GeneratedSessionSchema.safeParse(sessionWithoutTitle);
    expect(result.success).toBe(false);
  });

  it("rejects a block missing targetWatts", () => {
    const { targetWatts: _tw, ...blockWithoutWatts } = validSession.blocks[0];
    const session = { ...validSession, blocks: [blockWithoutWatts] };
    const result = GeneratedSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it("rejects durationSec: 6000 (> 5400 max per block)", () => {
    const session = {
      ...validSession,
      blocks: [{ ...validSession.blocks[0], durationSec: 6000 }],
    };
    const result = GeneratedSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it("rejects totalDurationSec: 15000 (> 14400 max)", () => {
    const session = { ...validSession, totalDurationSec: 15000 };
    const result = GeneratedSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });
});

describe("SessionBlockSchema", () => {
  it("accepts a valid block", () => {
    const result = SessionBlockSchema.safeParse(validBlock);
    expect(result.success).toBe(true);
  });

  it("rejects unknown type enum value", () => {
    const result = SessionBlockSchema.safeParse({ ...validBlock, type: "sprint" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown rpe enum value", () => {
    const result = SessionBlockSchema.safeParse({ ...validBlock, rpe: "Extreme" });
    expect(result.success).toBe(false);
  });
});
