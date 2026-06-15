/**
 * Tests for matchActivity — pure function for activity-to-session matching.
 * D-10: Match algorithm — same UTC calendar date AND ±20% duration tolerance.
 */
import { describe, it, expect } from "vitest";
import { matchActivity, FitSession, MatchableSession } from "./match";

const SESSION_DATE = "2026-06-10";

function makeSession(overrides: Partial<MatchableSession> = {}): MatchableSession {
  return {
    id: "session-1",
    title: "Threshold Intervals",
    createdAt: new Date(`${SESSION_DATE}T10:00:00.000Z`),
    totalDurationSec: 3600,
    ...overrides,
  };
}

describe("matchActivity", () => {
  it("returns {id, title} when same UTC date and duration within ±20%", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 3600, // ratio = 1.0
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toEqual({ id: "session-1", title: "Threshold Intervals" });
  });

  it("returns {id, title} when duration is at lower bound (ratio 0.8)", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 2880, // 3600 * 0.8 = 2880 → ratio exactly 0.8
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toEqual({ id: "session-1", title: "Threshold Intervals" });
  });

  it("returns {id, title} when duration is at upper bound (ratio 1.2)", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 4320, // 3600 * 1.2 = 4320 → ratio exactly 1.2
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toEqual({ id: "session-1", title: "Threshold Intervals" });
  });

  it("returns null when candidate is on a different UTC calendar date", () => {
    const fit: FitSession = {
      startedAt: new Date("2026-06-11T08:00:00.000Z"), // different day
      durationSec: 3600,
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toBeNull();
  });

  it("returns null when date matches but duration ratio is too low (ratio 0.5)", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 1800, // ratio = 0.5
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toBeNull();
  });

  it("returns null when date matches but duration ratio is too high (ratio 1.5)", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 5400, // ratio = 1.5
    };
    const result = matchActivity(fit, [makeSession()]);
    expect(result).toBeNull();
  });

  it("returns null when no sessions are provided", () => {
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 3600,
    };
    const result = matchActivity(fit, []);
    expect(result).toBeNull();
  });

  it("returns the first matching session when multiple exist", () => {
    const sessions: MatchableSession[] = [
      makeSession({ id: "session-1", title: "First" }),
      makeSession({ id: "session-2", title: "Second" }),
    ];
    const fit: FitSession = {
      startedAt: new Date(`${SESSION_DATE}T08:00:00.000Z`),
      durationSec: 3600,
    };
    const result = matchActivity(fit, sessions);
    expect(result).toEqual({ id: "session-1", title: "First" });
  });
});
