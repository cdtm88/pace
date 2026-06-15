/**
 * .zwo XML builder for Zwift-compatible workout files (TODAY-03).
 *
 * Security contract:
 *   - xmlEscape() is applied to ALL user-supplied text (title, notes) BEFORE
 *     interpolation into the XML document. Ampersand is escaped FIRST to prevent
 *     double-escaping (RESEARCH §Pitfall 4).
 *   - powerFraction is written via .toFixed(3) to avoid floating-point artifacts
 *     (e.g. 0.8999999999999999 → "0.900") — RESEARCH §Pitfall 6.
 *
 * This module is pure (no I/O, no DB, no auth). All security-sensitive escaping
 * is unit-tested in tests/zwo-export.test.ts.
 *
 * Used by:
 *   - src/app/api/session/[id]/export/route.ts (Route Handler)
 */
import type { GeneratedSession } from "@/lib/db/schemas/session";

// Derive the block type from the shared schema so this module tracks field changes.
type SessionBlock = GeneratedSession["blocks"][number];

// Minimal structural type accepted by buildZwoXml — both Drizzle $inferSelect rows
// and test fixtures satisfy this shape.
type SessionInput = {
  title: string;
  notes: string | null;
  blocks: unknown;
};

/**
 * Escape the 5 XML reserved characters in user-supplied strings.
 *
 * CRITICAL: & must be escaped FIRST. Escaping it after the others would
 * double-escape already-escaped sequences (e.g. &lt; → &amp;lt;).
 */
export function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Map a training block type to the corresponding Zwift workout XML element name.
 *
 * Mapping (D-12):
 *   warmup   → Warmup     (PowerLow + PowerHigh attributes)
 *   cooldown → Cooldown   (PowerLow + PowerHigh attributes)
 *   work     → SteadyState (Power attribute)
 *   rest     → SteadyState (Power attribute — low powerFraction)
 */
function blockTypeToZwiftElement(type: string): string {
  if (type === "warmup") return "Warmup";
  if (type === "cooldown") return "Cooldown";
  return "SteadyState"; // work + rest both map to SteadyState
}

/**
 * Sanitize a session title for use as a filesystem-safe filename base.
 *
 * Rules (D-13):
 *   1. Lowercase
 *   2. Replace any character that is not [a-z0-9-_] with a hyphen
 *   3. Collapse consecutive hyphens to a single hyphen
 *   4. Truncate to 50 characters
 *
 * The caller appends ".zwo" — this function does NOT include the extension.
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

/**
 * Build a Zwift-compatible .zwo XML document from a stored training session.
 *
 * @param session - Stored session row (or fixture with matching shape). The `blocks`
 *   field is typed as `unknown` (Drizzle jsonb column) and is cast internally.
 * @returns Complete XML string starting with the XML declaration.
 */
export function buildZwoXml(session: SessionInput): string {
  // Cast jsonb blocks to typed array — powerFraction is guaranteed present on every
  // stored block via the dual-path guarantee in compute-watts.ts (D-02).
  const blocks = session.blocks as SessionBlock[];

  const blockXml = blocks
    .map((b) => {
      const el = blockTypeToZwiftElement(b.type);
      const pf = b.powerFraction.toFixed(3); // 3 decimal places — Pitfall 6

      if (el === "Warmup" || el === "Cooldown") {
        // Zwift ramp elements use PowerLow + PowerHigh; use same value for flat power.
        return `    <${el} Duration="${b.durationSec}" PowerLow="${pf}" PowerHigh="${pf}"/>`;
      }

      return `    <SteadyState Duration="${b.durationSec}" Power="${pf}"/>`;
    })
    .join("\n");

  // XML-escape user-supplied text BEFORE interpolation (Pitfall 4).
  const title = xmlEscape(session.title);
  const description = xmlEscape(session.notes ?? "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>Pace</author>
  <name>${title}</name>
  <description>${description}</description>
  <sportType>bike</sportType>
  <workout>
${blockXml}
  </workout>
</workout_file>`;
}
