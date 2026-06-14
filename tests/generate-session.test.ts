/**
 * generateSessionAction — mocked-SDK unit tests.
 *
 * Tests the full D-09 execution order and error contract without a live
 * Anthropic API key or database connection.
 *
 * Behavior cases (per plan):
 *   1. Rate limit blocks → SDK not called, returns error
 *   2. Valid AI response → validateSessionSafety + DB insert + returns data
 *   3. Zod-invalid AI response (powerFraction 2.5) → returns generic error, no insert
 *   4. Zod-valid but safety-gate-failing response (powerFraction 1.6) → returns generic error, no insert
 *   5. SDK throws → returns "Generation failed" error
 *   6. Unauthenticated (no session.id) → SDK not called, returns auth error
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (vi.hoisted ensures these are available before module loading) ──

const {
  mockMessagesCreate,
  mockGetIronSession,
  mockGenerationLimit,
  mockReturning,
  mockValues,
  mockInsert,
  mockFindUserProfileByUserId,
} = vi.hoisted(() => {
  const mockMessagesCreate = vi.fn();
  const mockReturning = vi.fn();
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return {
    mockMessagesCreate,
    mockGetIronSession: vi.fn(),
    mockGenerationLimit: vi.fn(),
    mockReturning,
    mockValues,
    mockInsert,
    mockFindUserProfileByUserId: vi.fn(),
  };
});

// ── Mock: @anthropic-ai/sdk ───────────────────────────────────────────────────
// Use a class to satisfy Vitest v4's requirement for constructor mocks.
// The class's create method delegates to mockMessagesCreate so tests can control it.

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockMessagesCreate };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_opts: unknown) {}
    },
  };
});

// ── Mock: next/headers ────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

// ── Mock: iron-session ────────────────────────────────────────────────────────

vi.mock("iron-session", () => ({
  getIronSession: mockGetIronSession,
}));

// ── Mock: @/lib/ratelimit ─────────────────────────────────────────────────────

vi.mock("@/lib/ratelimit", () => ({
  generationLimiter: {
    limit: mockGenerationLimit,
  },
}));

// ── Mock: @/lib/db/index ──────────────────────────────────────────────────────

vi.mock("@/lib/db/index", () => ({
  db: {
    insert: mockInsert,
  },
}));

// ── Mock: @/lib/db/queries ────────────────────────────────────────────────────

vi.mock("@/lib/db/queries", () => ({
  findUserProfileByUserId: mockFindUserProfileByUserId,
}));

// ── Mock: @/env ───────────────────────────────────────────────────────────────

vi.mock("@/env", () => ({
  ANTHROPIC_API_KEY: "test-api-key",
}));

// ── Import SUT (after all mocks are registered) ───────────────────────────────

import { generateSessionAction } from "@/lib/actions/session";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validSessionJson = JSON.stringify({
  title: "Threshold Intervals 45 min",
  notes: "Sustained threshold work",
  totalDurationSec: 2700,
  blocks: [
    {
      order: 1,
      type: "warmup",
      durationSec: 600,
      powerFraction: 0.55,
      targetWatts: 165,
      rpe: "Easy",
      description: "Easy aerobic warmup",
    },
    {
      order: 2,
      type: "work",
      durationSec: 1800,
      powerFraction: 0.9,
      targetWatts: 270,
      rpe: "Hard",
      description: "Threshold effort",
    },
    {
      order: 3,
      type: "cooldown",
      durationSec: 300,
      powerFraction: 0.5,
      targetWatts: 150,
      rpe: "Easy",
      description: "Gentle cooldown",
    },
  ],
});

const zodInvalidJson = JSON.stringify({
  title: "Invalid Session",
  totalDurationSec: 2700,
  blocks: [
    {
      order: 1,
      type: "warmup",
      durationSec: 600,
      powerFraction: 2.5, // Fails Zod: max 1.8
      targetWatts: 375,
      rpe: "Easy",
      description: "Warmup",
    },
    {
      order: 2,
      type: "cooldown",
      durationSec: 300,
      powerFraction: 0.5,
      targetWatts: 75,
      rpe: "Easy",
      description: "Cooldown",
    },
  ],
});

const safetyGateFailJson = JSON.stringify({
  title: "Unsafe Session",
  totalDurationSec: 2700,
  blocks: [
    {
      order: 1,
      type: "warmup",
      durationSec: 600,
      powerFraction: 0.55,
      targetWatts: 165,
      rpe: "Easy",
      description: "Warmup",
    },
    {
      order: 2,
      type: "work",
      durationSec: 1800,
      powerFraction: 1.6, // Passes Zod (≤1.8) but fails safety gate (>1.5)
      targetWatts: 480,
      rpe: "Very Hard",
      description: "Extreme effort",
    },
    {
      order: 3,
      type: "cooldown",
      durationSec: 300,
      powerFraction: 0.5,
      targetWatts: 150,
      rpe: "Easy",
      description: "Cooldown",
    },
  ],
});

const mockInsertedSession = {
  id: "session-uuid-123",
  userId: "user-uuid-456",
  title: "Threshold Intervals 45 min",
  notes: "Sustained threshold work",
  readinessScore: 2,
  totalDurationSec: 2700,
  blocks: [],
  rawJson: validSessionJson,
  createdAt: new Date(),
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function mockAuthenticatedSession() {
  mockGetIronSession.mockResolvedValue({ id: "user-uuid-456", email: "test@example.com" });
}

function mockRateLimitAllow() {
  mockGenerationLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
}

function mockRateLimitBlock() {
  mockGenerationLimit.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
}

function mockSdkResponse(text: string) {
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: "text", text }],
    usage: { input_tokens: 500, output_tokens: 200, cache_creation_input_tokens: 1200, cache_read_input_tokens: 0 },
  });
}

function mockSdkThrow() {
  mockMessagesCreate.mockRejectedValue(new Error("Network error"));
}

function mockProfileWithFtp() {
  mockFindUserProfileByUserId.mockResolvedValue({
    id: "profile-uuid",
    userId: "user-uuid-456",
    ftp: 300,
    weight: 70,
    goals: "Build endurance",
    injuries: null,
    onboardingComplete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore DB chain (clearAllMocks wipes .mockReturnValue implementations)
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    // Default: DB insert returns the mock session
    mockReturning.mockResolvedValue([mockInsertedSession]);
    mockFindUserProfileByUserId.mockResolvedValue(null);
  });

  it("returns rate limit error and does NOT call the SDK when rate limit is exceeded", async () => {
    mockAuthenticatedSession();
    mockRateLimitBlock();

    const result = await generateSessionAction(2);

    expect(result).toEqual({ error: "Daily limit reached. Try again tomorrow." });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("calls validateSessionSafety + DB insert and returns data for a valid SDK response", async () => {
    mockAuthenticatedSession();
    mockRateLimitAllow();
    mockProfileWithFtp();
    mockSdkResponse(validSessionJson);

    const result = await generateSessionAction(2);

    // Should not be an error
    expect(result.error).toBeUndefined();
    // Should have returned data from DB
    expect(result.data).toBeDefined();
    expect(result.data).toEqual(mockInsertedSession);
    // DB insert should have been called
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
  });

  it("returns generic error and does NOT insert when SDK returns Zod-invalid JSON (powerFraction 2.5)", async () => {
    mockAuthenticatedSession();
    mockRateLimitAllow();
    mockProfileWithFtp();
    mockSdkResponse(zodInvalidJson);

    const result = await generateSessionAction(2);

    expect(result).toEqual({ error: "Couldn't generate a valid session. Please try again." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns generic error and does NOT insert when safety gate fails (powerFraction 1.6)", async () => {
    mockAuthenticatedSession();
    mockRateLimitAllow();
    mockProfileWithFtp();
    mockSdkResponse(safetyGateFailJson);

    const result = await generateSessionAction(2);

    expect(result).toEqual({ error: "Couldn't generate a valid session. Please try again." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns generation failed error when the SDK throws", async () => {
    mockAuthenticatedSession();
    mockRateLimitAllow();
    mockProfileWithFtp();
    mockSdkThrow();

    const result = await generateSessionAction(2);

    expect(result).toEqual({ error: "Generation failed. Please try again in a moment." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns auth error and does NOT call the SDK when there is no session.id", async () => {
    // Unauthenticated: session.id is empty string (falsy)
    mockGetIronSession.mockResolvedValue({ id: "", email: "" });

    const result = await generateSessionAction(2);

    expect(result).toEqual({ error: "Not authenticated" });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(mockGenerationLimit).not.toHaveBeenCalled();
  });
});
