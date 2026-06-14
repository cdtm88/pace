/**
 * PROF-01: profileSchema validation coverage.
 * PROF-01/PROF-02: findUserProfileByUserId export assertion.
 *
 * No live DB connection — structural/schema-level unit tests only.
 */
import { describe, it, expect } from "vitest";
import { profileSchema } from "@/lib/db/schemas/profile";
import { findUserProfileByUserId } from "@/lib/db/queries";

describe("profileSchema", () => {
  it("fails when goals is empty (min 1)", () => {
    const result = profileSchema.safeParse({
      goals: "",
      injuries: "",
      ftp: undefined,
      weight: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe(
      "Describe your training goals to continue."
    );
  });

  it("succeeds with goals only; injuries defaults to empty string; ftp undefined", () => {
    const result = profileSchema.safeParse({
      goals: "Build base",
      injuries: undefined,
      ftp: undefined,
      weight: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.data!.ftp).toBeUndefined();
    expect(result.data!.injuries).toBe("");
  });

  it("succeeds with goals + numeric ftp and weight", () => {
    const result = profileSchema.safeParse({
      goals: "x",
      ftp: 250,
      weight: 70,
    });
    expect(result.success).toBe(true);
    expect(result.data!.ftp).toBe(250);
  });

  it("coerces string ftp '250' to number 250", () => {
    const result = profileSchema.safeParse({
      goals: "x",
      ftp: "250",
    });
    expect(result.success).toBe(true);
    expect(result.data!.ftp).toBe(250);
  });

  it("fails when ftp is below min (50)", () => {
    const result = profileSchema.safeParse({
      goals: "x",
      ftp: 40,
    });
    expect(result.success).toBe(false);
  });
});

describe("findUserProfileByUserId", () => {
  it("is exported as a function from queries.ts", () => {
    expect(typeof findUserProfileByUserId).toBe("function");
  });
});
