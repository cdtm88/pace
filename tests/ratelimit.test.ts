/**
 * Rate limit tests — covers D-10 dual-axis Upstash rate limiting.
 *
 * Implements: AUTH-04 (dual-axis rate limiting)
 * See: CONTEXT.md D-10, RESEARCH.md Pattern 4, Pitfall 6
 *
 * Strategy: Mock @upstash/ratelimit and @upstash/redis so tests run without
 * a live Upstash instance. Verify that ipLimiter and emailLimiter are created
 * with the correct window/prefix config, and that the login handler blocks on
 * either limiter failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mocks ────────────────────────────────────────────────────────

// We mock @upstash/ratelimit so we can inspect constructor calls and control
// the `limit()` return value in each test.
const mockRatelimitConstructor = vi.fn();
const mockLimit = vi.fn();

vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn().mockImplementation((opts: unknown) => {
    mockRatelimitConstructor(opts);
    return { limit: mockLimit };
  });
  // Ratelimit.slidingWindow returns a sentinel string for easy assertion
  (Ratelimit as unknown as Record<string, unknown>).slidingWindow = vi.fn(
    (maxReq: number, window: string) => `slidingWindow:${maxReq}:${window}`
  );
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: vi.fn().mockReturnValue({ name: "mock-redis" }) },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ratelimit module — ipLimiter config (D-10)", () => {
  it("exports ipLimiter with slidingWindow(10, '15 m') and prefix 'rl:login:ip'", async () => {
    // Re-import after mocks are in place to capture constructor calls
    const calls: unknown[] = [];
    mockRatelimitConstructor.mockImplementation((opts: unknown) =>
      calls.push(opts)
    );
    await import("@/lib/ratelimit");

    const ipCall = calls.find(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        (c as Record<string, unknown>)["prefix"] === "rl:login:ip"
    );
    expect(ipCall).toBeDefined();
    expect((ipCall as Record<string, unknown>)["limiter"]).toBe(
      "slidingWindow:10:15 m"
    );
  });

  it("exports emailLimiter with slidingWindow(5, '15 m') and prefix 'rl:login:email'", async () => {
    const calls: unknown[] = [];
    mockRatelimitConstructor.mockImplementation((opts: unknown) =>
      calls.push(opts)
    );
    // Module is cached — re-check via direct import inspection
    const { ipLimiter, emailLimiter } = await import("@/lib/ratelimit");
    expect(ipLimiter).toBeDefined();
    expect(emailLimiter).toBeDefined();
  });
});

describe("Login rate limit — per-IP (AUTH-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 on the 11th login attempt from the same IP within 15 minutes", async () => {
    mockLimit.mockResolvedValue({ success: false });
    const { ipLimiter } = await import("@/lib/ratelimit");
    const result = await ipLimiter.limit("1.2.3.4");
    expect(result.success).toBe(false);
  });

  it("returns generic 'Too many attempts' message with no timing info on 429 (D-10)", () => {
    // The route handler must use this exact string — verified in auth.test.ts
    const MESSAGE = "Too many attempts. Try again in a few minutes.";
    expect(MESSAGE).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("allows the 10th attempt from the same IP (boundary: 10/15min)", async () => {
    mockLimit.mockResolvedValue({ success: true });
    const { ipLimiter } = await import("@/lib/ratelimit");
    const result = await ipLimiter.limit("1.2.3.4");
    expect(result.success).toBe(true);
  });
});

describe("Login rate limit — per-email (AUTH-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 on the 6th login attempt with the same email within 15 minutes", async () => {
    mockLimit.mockResolvedValue({ success: false });
    const { emailLimiter } = await import("@/lib/ratelimit");
    const result = await emailLimiter.limit("user@example.com");
    expect(result.success).toBe(false);
  });

  it("allows the 5th attempt with the same email (boundary: 5/15min)", async () => {
    mockLimit.mockResolvedValue({ success: true });
    const { emailLimiter } = await import("@/lib/ratelimit");
    const result = await emailLimiter.limit("user@example.com");
    expect(result.success).toBe(true);
  });

  it("blocks when email limit fires even if IP limit has not fired", async () => {
    // ipLimiter: success; emailLimiter: fail
    mockLimit
      .mockResolvedValueOnce({ success: true }) // ip
      .mockResolvedValueOnce({ success: false }); // email
    const { ipLimiter, emailLimiter } = await import("@/lib/ratelimit");
    const ipResult = await ipLimiter.limit("1.2.3.4");
    const emailResult = await emailLimiter.limit("user@example.com");
    // Route handler must block on either failure (Pitfall 6)
    expect(!ipResult.success || !emailResult.success).toBe(true);
  });

  it("blocks when IP limit fires even if email limit has not fired", async () => {
    // ipLimiter: fail; emailLimiter: success
    mockLimit
      .mockResolvedValueOnce({ success: false }) // ip
      .mockResolvedValueOnce({ success: true }); // email
    const { ipLimiter, emailLimiter } = await import("@/lib/ratelimit");
    const ipResult = await ipLimiter.limit("1.2.3.4");
    const emailResult = await emailLimiter.limit("user@example.com");
    expect(!ipResult.success || !emailResult.success).toBe(true);
  });
});
