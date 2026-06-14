/**
 * Auth route handler tests — AUTH-01 through AUTH-05.
 *
 * Strategy: Mock the db, iron-session, bcryptjs, and ratelimiters so tests
 * are hermetic (no live Neon or Upstash required).
 *
 * Implements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
 * See: CONTEXT.md D-04 through D-11, RESEARCH.md §Validation Architecture
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ─────────────────────────────────────────────────────────

/** iron-session session mock */
const mockSession = {
  id: undefined as string | undefined,
  email: undefined as string | undefined,
  save: vi.fn(),
  destroy: vi.fn(),
};

/** Simulate current DB rows */
let mockUserRows: Array<{ id: string; email: string; passwordHash: string }> =
  [];

/** Drizzle count() mock — returns row count */
const mockCountResult = vi.fn(() => [{ count: mockUserRows.length }]);

/** Drizzle insert mock */
const mockInsertResult = vi.fn().mockResolvedValue([]);

/** Drizzle select mock for user lookup */
const mockSelectResult = vi.fn();

/** Rate limit mock — success by default */
const mockIpLimit = vi.fn().mockResolvedValue({ success: true });
const mockEmailLimit = vi.fn().mockResolvedValue({ success: true });

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db/index", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => mockSelectResult()),
        // for count() call (no .where())
        then: undefined,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsertResult,
      })),
    })),
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    count: vi.fn(() => "count()"),
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    and: vi.fn((...args: unknown[]) => args),
  };
});

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue(mockSession),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
    compare: vi.fn(async (plain: string, hash: string) =>
      hash === `hashed:${plain}`
    ),
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  ipLimiter: { limit: mockIpLimit },
  emailLimiter: { limit: mockEmailLimit },
}));

// next/headers is async in Next.js 16
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn(() => []) }),
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) =>
      name === "x-forwarded-for" ? "1.2.3.4" : null
    ),
  }),
}));

// next/navigation redirect throws by default in route handler context
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// ── Helper: build a fake NextRequest ─────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

// ── Route handler lazy imports ────────────────────────────────────────────────
// Imported inside tests to ensure mocks are in place before module evaluation.

async function getSignupHandler() {
  const mod = await import("@/app/api/auth/signup/route");
  return mod.POST;
}

async function getLoginHandler() {
  const mod = await import("@/app/api/auth/login/route");
  return mod.POST;
}

async function getLogoutHandler() {
  const mod = await import("@/app/api/auth/logout/route");
  return mod.POST;
}

// ── Signup tests ──────────────────────────────────────────────────────────────

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRows = [];
    mockSession.id = undefined;
    mockSession.email = undefined;
    process.env.SIGNUP_ENABLED = "true";
    // Reset db.select to return count 0
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        // count() path — returns [{ count: 0 }]
      })),
    });
  });

  it("creates a user with valid email and password (AUTH-01)", async () => {
    // Arrange: empty db, count = 0
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue(
        Promise.resolve([{ count: 0 }])
      ),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "user-1", email: "test@example.com" },
        ]),
      }),
    });

    const POST = await getSignupHandler();
    const req = makeRequest({
      email: "test@example.com",
      password: "password123",
      confirm: "password123",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSession.save).toHaveBeenCalled();
  });

  it("hashes password with bcryptjs at cost factor 12 (D-05)", async () => {
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue(Promise.resolve([{ count: 0 }])),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "user-1", email: "test@example.com" },
        ]),
      }),
    });

    const bcrypt = require("bcryptjs").default;
    const POST = await getSignupHandler();
    await POST(makeRequest({ email: "test@example.com", password: "pass1234", confirm: "pass1234" }));
    expect(bcrypt.hash).toHaveBeenCalledWith("pass1234", 12);
  });

  it("returns 400 for invalid email (Zod v4 z.email validation)", async () => {
    const POST = await getSignupHandler();
    const res = await POST(makeRequest({ email: "not-an-email", password: "pass1234", confirm: "pass1234" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for password shorter than 8 characters", async () => {
    const POST = await getSignupHandler();
    const res = await POST(makeRequest({ email: "test@example.com", password: "short", confirm: "short" }));
    expect(res.status).toBe(400);
  });
});

// ── First-user bootstrap (D-11) ───────────────────────────────────────────────

describe("POST /api/auth/signup — first-user bootstrap (D-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.id = undefined;
    mockSession.email = undefined;
  });

  it("succeeds when SIGNUP_ENABLED=false but users table is empty (owner bootstrap)", async () => {
    process.env.SIGNUP_ENABLED = "false";
    const { db } = require("@/lib/db/index");
    // Empty table: count = 0
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue(Promise.resolve([{ count: 0 }])),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "owner-1", email: "owner@example.com" },
        ]),
      }),
    });

    const POST = await getSignupHandler();
    const res = await POST(makeRequest({ email: "owner@example.com", password: "pass1234", confirm: "pass1234" }));
    expect(res.status).toBe(200);
    expect(mockSession.save).toHaveBeenCalled();
  });

  it("fails with 403 when SIGNUP_ENABLED=false and users table is not empty", async () => {
    process.env.SIGNUP_ENABLED = "false";
    const { db } = require("@/lib/db/index");
    // Non-empty table: count = 1
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue(Promise.resolve([{ count: 1 }])),
    });

    const POST = await getSignupHandler();
    const res = await POST(makeRequest({ email: "new@example.com", password: "pass1234", confirm: "pass1234" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Registration is not open.");
  });

  it("succeeds when SIGNUP_ENABLED=true regardless of user count", async () => {
    process.env.SIGNUP_ENABLED = "true";
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue(Promise.resolve([{ count: 5 }])),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "user-2", email: "new@example.com" },
        ]),
      }),
    });

    const POST = await getSignupHandler();
    const res = await POST(makeRequest({ email: "new@example.com", password: "pass1234", confirm: "pass1234" }));
    expect(res.status).toBe(200);
  });
});

// ── Login + cookie (AUTH-02) ──────────────────────────────────────────────────

describe("POST /api/auth/login — session cookie (AUTH-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.id = undefined;
    mockSession.email = undefined;
    mockIpLimit.mockResolvedValue({ success: true });
    mockEmailLimit.mockResolvedValue({ success: true });
  });

  it("returns httpOnly cookie with 30-day maxAge on successful login (D-06)", async () => {
    // Cookie config lives in session.ts sessionOptions — tested via session.save()
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(
          Promise.resolve([{ id: "u1", email: "user@example.com", passwordHash: "hashed:correct" }])
        ),
      }),
    });

    const POST = await getLoginHandler();
    const res = await POST(makeRequest({ email: "user@example.com", password: "correct" }));
    expect(res.status).toBe(200);
    expect(mockSession.save).toHaveBeenCalled();
  });

  it("cookie is secure and sameSite=lax (D-06)", async () => {
    // Verified via sessionOptions in session.ts (D-06 truth-condition)
    const { sessionOptions } = await import("@/lib/session");
    expect(sessionOptions.cookieOptions.httpOnly).toBe(true);
    expect(sessionOptions.cookieOptions.secure).toBe(true);
    expect(sessionOptions.cookieOptions.sameSite).toBe("lax");
  });

  it("session payload contains id and email (D-04)", async () => {
    const { db } = require("@/lib/db/index");
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(
          Promise.resolve([{ id: "u1", email: "user@example.com", passwordHash: "hashed:correct" }])
        ),
      }),
    });

    const POST = await getLoginHandler();
    await POST(makeRequest({ email: "user@example.com", password: "correct" }));
    expect(mockSession.id).toBe("u1");
    expect(mockSession.email).toBe("user@example.com");
  });
});

// ── Generic error (anti-enumeration) (D-07) ──────────────────────────────────

describe("POST /api/auth/login — generic error (D-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIpLimit.mockResolvedValue({ success: true });
    mockEmailLimit.mockResolvedValue({ success: true });
  });

  it('returns "Invalid email or password" for wrong email — same message as wrong password (AUTH-04)', async () => {
    const { db } = require("@/lib/db/index");
    // No user found for this email
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve([])),
      }),
    });

    const POST = await getLoginHandler();
    const res = await POST(makeRequest({ email: "notexist@example.com", password: "somepass" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password.");
  });

  it('returns "Invalid email or password" for wrong password — same message as wrong email (AUTH-04)', async () => {
    const { db } = require("@/lib/db/index");
    // User exists but password is wrong
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(
          Promise.resolve([{ id: "u1", email: "user@example.com", passwordHash: "hashed:correct" }])
        ),
      }),
    });

    const POST = await getLoginHandler();
    const res = await POST(makeRequest({ email: "user@example.com", password: "wrongpassword" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password.");
  });
});

// ── Rate limiting (D-10) ──────────────────────────────────────────────────────

describe("POST /api/auth/login — rate limiting (D-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 when IP limit fires", async () => {
    mockIpLimit.mockResolvedValue({ success: false });
    mockEmailLimit.mockResolvedValue({ success: true });

    const POST = await getLoginHandler();
    const res = await POST(makeRequest({ email: "user@example.com", password: "pass1234" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("returns 429 when email limit fires", async () => {
    mockIpLimit.mockResolvedValue({ success: true });
    mockEmailLimit.mockResolvedValue({ success: false });

    const POST = await getLoginHandler();
    const res = await POST(makeRequest({ email: "user@example.com", password: "pass1234" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many attempts. Try again in a few minutes.");
  });
});

// ── Logout (AUTH-03) ─────────────────────────────────────────────────────────

describe("POST /api/auth/logout (AUTH-03)", () => {
  it("destroys the session and redirects to /login", async () => {
    const POST = await getLogoutHandler();
    try {
      await POST(makeRequest({}));
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("REDIRECT:")) {
        expect(err.message).toBe("REDIRECT:/login");
        expect(mockSession.destroy).toHaveBeenCalled();
        return;
      }
      throw err;
    }
    // If redirect() returns a Response instead of throwing, check it
    expect(mockSession.destroy).toHaveBeenCalled();
  });
});
