/**
 * Coggan 7-zone power model utility — pure TypeScript, zero dependencies.
 *
 * Returns null when FTP is absent (PROF-03 RPE fallback path).
 * Callers check for null and render RPE descriptions instead of zone/watt labels.
 *
 * Used by:
 *   - Phase 3: prompt building (server-side zone context for Claude)
 *   - Phase 4: Today view (client-side zone label display)
 *
 * Zone boundary source: Coggan model as implemented by Zwift, TrainingPeaks, Strava.
 * Z1/Z2 boundary at 55%/56% FTP (see RESEARCH.md Assumption A1).
 */

export type PowerZone = {
  zone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  label: string; // "Z1"–"Z7" — short label for Today view
  minWatts: number;
  maxWatts: number | null; // null for Zone 7 (no upper bound)
  minPct: number; // % of FTP lower bound (inclusive)
  maxPct: number | null; // % of FTP upper bound (inclusive); null = open
};

// Coggan 7-zone model — FTP percentages
// Source: roadmancycling.com/blog/ftp-training-zones-cycling-complete-guide
const ZONE_DEFINITIONS = [
  { zone: 1, name: "Active Recovery",     label: "Z1", minPct: 0,    maxPct: 0.55  },
  { zone: 2, name: "Endurance",           label: "Z2", minPct: 0.56, maxPct: 0.75  },
  { zone: 3, name: "Tempo",              label: "Z3", minPct: 0.76, maxPct: 0.90  },
  { zone: 4, name: "Threshold",          label: "Z4", minPct: 0.91, maxPct: 1.05  },
  { zone: 5, name: "VO2 Max",            label: "Z5", minPct: 1.06, maxPct: 1.20  },
  { zone: 6, name: "Anaerobic Capacity", label: "Z6", minPct: 1.21, maxPct: 1.50  },
  { zone: 7, name: "Neuromuscular Power",label: "Z7", minPct: 1.51, maxPct: null  },
] as const;

/**
 * Returns all 7 power zones computed from FTP.
 * Returns null when ftp is null/undefined/0 (RPE fallback path — PROF-03).
 */
export function computeZones(ftp: number | null | undefined): PowerZone[] | null {
  if (!ftp) return null;
  return ZONE_DEFINITIONS.map((def) => ({
    ...def,
    minWatts: Math.round(ftp * def.minPct),
    maxWatts: def.maxPct !== null ? Math.round(ftp * def.maxPct) : null,
  })) as PowerZone[];
}

/**
 * Returns the zone a given wattage falls into.
 * Returns null when ftp is absent (PROF-03 RPE path).
 * Falls back to Z7 for any wattage above all defined upper bounds.
 */
export function getZoneForWatts(
  watts: number,
  ftp: number | null | undefined
): PowerZone | null {
  const zones = computeZones(ftp);
  if (!zones) return null;
  return zones.find((z) => z.maxWatts === null || watts <= z.maxWatts) ?? zones[6];
}
