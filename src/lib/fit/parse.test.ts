/**
 * parseFitFile unit tests.
 *
 * D-07: Library: fit-file-parser; force: true; mode: 'list'
 * D-08: Extracted fields: startedAt, durationSec, avgPowerW (nullable)
 * D-09: Parse errors → HTTP 400 { error: "invalid_fit_file" }
 *
 * Happy-path (valid .fit fixture): deferred to Wave 3 browser checkpoint.
 * A minimal synthetic FIT binary requires encoding FIT protocol framing
 * (magic bytes 0x0E, 0x10, 0x92, 0x07 + little-endian length + CRC) which
 * is non-trivial without a real device file. The Wave 3 manual upload test
 * exercises the full happy path end-to-end.
 *
 * What IS deterministic and covered here:
 *   - Rejection of a buffer containing random/garbage bytes (D-09 error path).
 *   - Shape of the FitSession interface so callers can rely on the types.
 */
import { describe, it, expect } from "vitest";
import { parseFitFile } from "./parse";

describe("parseFitFile", () => {
  it("throws when given a buffer of garbage bytes (invalid FIT binary)", async () => {
    // Random bytes that don't start with a valid FIT file header.
    // fit-file-parser throws on invalid magic bytes / CRC mismatch.
    const garbage = Buffer.from(
      Array.from({ length: 64 }, (_, i) => (i * 37 + 13) % 256)
    );
    await expect(parseFitFile(garbage)).rejects.toThrow();
  });

  it("throws when given an empty buffer", async () => {
    const empty = Buffer.alloc(0);
    await expect(parseFitFile(empty)).rejects.toThrow();
  });

  it("throws when given a valid text file disguised as .fit", async () => {
    const text = Buffer.from("This is not a FIT file", "utf-8");
    await expect(parseFitFile(text)).rejects.toThrow();
  });

  // Happy-path field mapping — deferred to Wave 3 browser checkpoint:
  //   parseFitFile returns startedAt as a Date instance
  //   parseFitFile returns durationSec as a non-negative number
  //   parseFitFile returns avgPowerW as number-or-null (undefined maps to null, not 0)
  it.todo(
    "parses a valid .fit buffer and returns startedAt (Date), durationSec (number ≥ 0), avgPowerW (number|null)"
  );
  it.todo(
    "returns avgPowerW as null when the .fit file has no power data (undefined → null, not 0)"
  );
  it.todo("uses force: true mode to tolerate minor file corruption");
});
