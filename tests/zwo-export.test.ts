/**
 * TODAY-03: .zwo XML builder unit tests.
 *
 * Covers xmlEscape (escape order, all 5 characters), blockTypeToZwiftElement
 * (via buildZwoXml block element output), buildZwoXml (XML structure, block
 * mapping, powerFraction precision, null notes), and sanitizeFilename
 * (lowercase, collapse repeats, 50-char cap).
 */
import { describe, it, expect } from "vitest";
import { buildZwoXml, xmlEscape, sanitizeFilename } from "@/lib/training/zwo";

// Fixture shaped like GeneratedSession["blocks"][number] from session-schema.test.ts
const warmupBlock = {
  order: 1,
  type: "warmup" as const,
  durationSec: 600,
  powerFraction: 0.55,
  targetWatts: 165,
  rpe: "Easy" as const,
  description: "Easy spin",
};

const workBlock = {
  order: 2,
  type: "work" as const,
  durationSec: 1200,
  powerFraction: 0.75,
  targetWatts: 225,
  rpe: "Hard" as const,
  description: "Threshold interval",
};

const restBlock = {
  order: 3,
  type: "rest" as const,
  durationSec: 300,
  powerFraction: 0.4,
  targetWatts: 120,
  rpe: "Easy" as const,
  description: "Easy recovery",
};

const cooldownBlock = {
  order: 4,
  type: "cooldown" as const,
  durationSec: 300,
  powerFraction: 0.5,
  targetWatts: 150,
  rpe: "Easy" as const,
  description: "Gentle cooldown",
};

const baseSession = {
  title: "Threshold Ladder 45 min",
  notes: "Focus on cadence 90+",
  totalDurationSec: 2400,
  blocks: [warmupBlock, workBlock, restBlock, cooldownBlock],
};

// ── xmlEscape ─────────────────────────────────────────────────────────────────

describe("xmlEscape", () => {
  it("escapes & before < to prevent double-escaping (input '&<' → '&amp;&lt;')", () => {
    expect(xmlEscape("&<")).toBe("&amp;&lt;");
  });

  it("escapes & as &amp;", () => {
    expect(xmlEscape("A & B")).toBe("A &amp; B");
  });

  it("escapes < as &lt;", () => {
    expect(xmlEscape("a < b")).toBe("a &lt; b");
  });

  it("escapes > as &gt;", () => {
    expect(xmlEscape("a > b")).toBe("a &gt; b");
  });

  it('escapes " as &quot;', () => {
    expect(xmlEscape('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes ' as &apos;", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  it("escapes all 5 characters in a complex string without double-escaping the ampersand", () => {
    // '5 × 5 < VO2 & "max"' — the & should be &amp; not &&amp;
    const result = xmlEscape('5 × 5 < VO2 & "max"');
    expect(result).toContain("&amp;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&quot;");
    expect(result).not.toContain("&&amp;"); // no double-escaping
  });

  it("returns empty string unchanged", () => {
    expect(xmlEscape("")).toBe("");
  });

  it("returns a plain string unchanged", () => {
    expect(xmlEscape("hello world")).toBe("hello world");
  });
});

// ── buildZwoXml — document structure ─────────────────────────────────────────

describe("buildZwoXml - document structure", () => {
  it("starts with the XML declaration", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it("contains <workout_file> root element", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<workout_file>");
    expect(xml).toContain("</workout_file>");
  });

  it("contains <author>Pace</author>", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<author>Pace</author>");
  });

  it("contains <sportType>bike</sportType>", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<sportType>bike</sportType>");
  });

  it("contains a <workout> element wrapping blocks", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<workout>");
    expect(xml).toContain("</workout>");
  });

  it("contains <name> with session title", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<name>Threshold Ladder 45 min</name>");
  });

  it("contains <description> with session notes", () => {
    const xml = buildZwoXml(baseSession);
    expect(xml).toContain("<description>Focus on cadence 90+</description>");
  });

  it("renders <description></description> when notes is null", () => {
    const session = { ...baseSession, notes: null };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<description></description>");
  });
});

// ── buildZwoXml — block type mapping ─────────────────────────────────────────

describe("buildZwoXml - block type mapping", () => {
  it("maps warmup block to <Warmup> with PowerLow and PowerHigh attributes", () => {
    const session = { ...baseSession, blocks: [warmupBlock] };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<Warmup");
    expect(xml).toContain("PowerLow=");
    expect(xml).toContain("PowerHigh=");
  });

  it("maps cooldown block to <Cooldown> with PowerLow and PowerHigh attributes", () => {
    const session = { ...baseSession, blocks: [cooldownBlock] };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<Cooldown");
    expect(xml).toContain("PowerLow=");
    expect(xml).toContain("PowerHigh=");
  });

  it("maps work block to <SteadyState> with Power attribute", () => {
    const session = { ...baseSession, blocks: [workBlock] };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<SteadyState");
    expect(xml).toContain("Power=");
  });

  it("maps rest block to <SteadyState> with Power attribute", () => {
    const session = { ...baseSession, blocks: [restBlock] };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<SteadyState");
    expect(xml).toContain("Power=");
  });

  it("warmup block does NOT produce Power= attribute (uses PowerLow/PowerHigh only)", () => {
    const session = { ...baseSession, blocks: [warmupBlock] };
    const xml = buildZwoXml(session);
    // The XML should not have a bare Power= attribute for warmup
    expect(xml).not.toMatch(/Warmup[^/]*Power="/);
  });
});

// ── buildZwoXml — powerFraction precision ────────────────────────────────────

describe("buildZwoXml - powerFraction precision", () => {
  it("writes powerFraction 0.75 as '0.750' (toFixed(3))", () => {
    const session = { ...baseSession, blocks: [workBlock] }; // workBlock.powerFraction = 0.75
    const xml = buildZwoXml(session);
    expect(xml).toContain('Power="0.750"');
  });

  it("writes powerFraction 0.8999999999999999 as '0.900' (float rounding handled by toFixed)", () => {
    const block = { ...workBlock, powerFraction: 0.8999999999999999 };
    const session = { ...baseSession, blocks: [block] };
    const xml = buildZwoXml(session);
    expect(xml).toContain('Power="0.900"');
  });

  it("writes warmup powerFraction 0.55 as '0.550' in PowerLow and PowerHigh", () => {
    const session = { ...baseSession, blocks: [warmupBlock] }; // warmupBlock.powerFraction = 0.55
    const xml = buildZwoXml(session);
    expect(xml).toContain('PowerLow="0.550"');
    expect(xml).toContain('PowerHigh="0.550"');
  });
});

// ── buildZwoXml — XML escaping of user text ───────────────────────────────────

describe("buildZwoXml - XML escaping", () => {
  it("XML-escapes '<' and '&' in session title before interpolation into <name>", () => {
    const session = { ...baseSession, title: "5 < VO2 & Max" };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<name>5 &lt; VO2 &amp; Max</name>");
  });

  it("XML-escapes notes before interpolation into <description>", () => {
    const session = { ...baseSession, notes: 'Use "clip-on" bars' };
    const xml = buildZwoXml(session);
    expect(xml).toContain("<description>Use &quot;clip-on&quot; bars</description>");
  });
});

// ── buildZwoXml — Duration attribute ─────────────────────────────────────────

describe("buildZwoXml - Duration attribute", () => {
  it("includes Duration attribute on work block with correct durationSec value", () => {
    const session = { ...baseSession, blocks: [workBlock] }; // durationSec = 1200
    const xml = buildZwoXml(session);
    expect(xml).toContain('Duration="1200"');
  });

  it("includes Duration attribute on warmup block with correct durationSec value", () => {
    const session = { ...baseSession, blocks: [warmupBlock] }; // durationSec = 600
    const xml = buildZwoXml(session);
    expect(xml).toContain('Duration="600"');
  });
});

// ── sanitizeFilename ──────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("lowercases the title", () => {
    expect(sanitizeFilename("Threshold")).toBe("threshold");
  });

  it("replaces non-[a-z0-9-_] characters with hyphen", () => {
    expect(sanitizeFilename("Hello World")).toBe("hello-world");
  });

  it("replaces '!' with hyphen", () => {
    expect(sanitizeFilename("Push!")).toBe("push-");
  });

  it("collapses repeated hyphens to a single hyphen", () => {
    // "Threshold  Ladder" → "threshold--ladder" → "threshold-ladder"
    expect(sanitizeFilename("Threshold  Ladder")).toBe("threshold-ladder");
  });

  it("caps at 50 characters", () => {
    const long = "a".repeat(60);
    expect(sanitizeFilename(long)).toHaveLength(50);
  });

  it("sanitizes 'Threshold Ladder 45 min!' → 'threshold-ladder-45-min-'", () => {
    // Non-alphanumeric space → hyphen; ! → hyphen; no repeated hyphens here
    const result = sanitizeFilename("Threshold Ladder 45 min!");
    expect(result).toBe("threshold-ladder-45-min-");
  });

  it("preserves existing hyphens and underscores", () => {
    expect(sanitizeFilename("base-build_phase")).toBe("base-build_phase");
  });

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });
});
