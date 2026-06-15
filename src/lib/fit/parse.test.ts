/**
 * Wave 2 scaffold: parseFitFile tests.
 * These are pending placeholders — parseFitFile is implemented in Wave 2.
 * Convert it.todo() → real tests when src/lib/fit/parse.ts is implemented.
 *
 * D-07: Library: fit-file-parser; force: true; mode: 'list'
 * D-08: Extracted fields: startedAt, durationSec, avgPowerW (nullable)
 * D-09: Parse errors → HTTP 400 { error: "invalid_fit_file" }
 */
import { describe, it } from "vitest";

describe("parseFitFile", () => {
  it.todo("parses a valid .fit buffer and returns startedAt, durationSec, and avgPowerW");
  it.todo("returns avgPowerW as null when the .fit file has no power data");
  it.todo("throws an error when passed an invalid (non-FIT) buffer");
  it.todo("uses force: true mode to tolerate minor file corruption");
});
