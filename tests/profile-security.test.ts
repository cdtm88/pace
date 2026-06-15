/**
 * saveProfileAction — security contract tests.
 *
 * PROF-01 / T-02-01: userId is read from iron-session only, never from FormData.
 * PROF-02 / T-02-01: upsert calls onConflictDoUpdate on userProfiles.userId —
 *                    a second save updates rather than inserts a duplicate row.
 *
 * No live DB connection — all external deps mocked via vi.hoisted + vi.mock.
 *
 * FormData note: formData.get() returns null for absent fields; the form always
 * submits injuries as "" (empty string). Tests replicate this by appending it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockGetIronSession,
  mockRedirect,
  mockOnConflictDoUpdate,
  mockValues,
  mockInsert,
} = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return {
    mockGetIronSession: vi.fn(),
    mockRedirect: vi.fn(),
    mockOnConflictDoUpdate,
    mockValues,
    mockInsert,
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

vi.mock("iron-session", () => ({
  getIronSession: mockGetIronSession,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/db/index", () => ({
  db: { insert: mockInsert },
}));

vi.mock("@/lib/session", () => ({
  sessionOptions: {},
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────

import { saveProfileAction } from "@/lib/actions/profile";
import { userProfiles } from "@/lib/db/schema";

// ── Helper: minimal valid FormData (mirrors what the form actually submits) ────

function validFormData(extra?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append("goals", "Build base fitness");
  fd.append("injuries", ""); // form always submits this field, even when empty
  if (extra) {
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  }
  return fd;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("saveProfileAction — security contract (T-02-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PROF-01: function signature has 2 params — userId is NOT accepted as an argument", () => {
    // If userId were a parameter, an attacker could pass it directly.
    // The correct signature is (_prevState, formData) — exactly 2 params.
    expect(saveProfileAction.length).toBe(2);
  });

  it("PROF-01: userId written to DB comes from iron-session, not from a spoofed FormData field", async () => {
    const SESSION_USER_ID = "session-user-uuid-1234";
    mockGetIronSession.mockResolvedValue({ id: SESSION_USER_ID });

    // Inject a spoofed userId field — the action must NOT use this value.
    const formData = validFormData({ userId: "attacker-injected-uuid-9999" });

    await saveProfileAction(null, formData);

    const insertedValues = mockValues.mock.calls[0]?.[0];
    expect(insertedValues).toBeDefined();
    expect(insertedValues.userId).toBe(SESSION_USER_ID);
    expect(insertedValues.userId).not.toBe("attacker-injected-uuid-9999");
  });

  it("PROF-02: calling saveProfileAction twice triggers onConflictDoUpdate both times — no duplicate rows", async () => {
    mockGetIronSession.mockResolvedValue({ id: "user-uuid-abc" });

    const formData = validFormData();

    await saveProfileAction(null, formData);
    await saveProfileAction(null, formData);

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2);

    const conflictArg = mockOnConflictDoUpdate.mock.calls[0]?.[0];
    expect(conflictArg).toBeDefined();
    expect(conflictArg.target).toBe(userProfiles.userId);
  });
});
