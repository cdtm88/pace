"use client";

/**
 * SessionBlockRow — a single block list row in the pre-ride summary.
 *
 * When FTP is set: renders zone label as a pill badge (e.g. "Z4 / Threshold").
 * When FTP is absent: renders RPE descriptor as plain muted text (e.g. "Hard").
 *
 * Format: "{Type} · {duration} · {zone-or-RPE}"
 * Separator: U+00B7 MIDDLE DOT (·)
 */

import { getZoneForWatts } from "@/lib/training/zones";
import { formatDuration } from "@/lib/training/format";
import type { GeneratedSession } from "@/lib/db/schemas/session";

interface SessionBlockRowProps {
  block: GeneratedSession["blocks"][number];
  ftp: number | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SessionBlockRow({ block, ftp }: SessionBlockRowProps) {
  const zone = getZoneForWatts(block.targetWatts, ftp);

  return (
    <div className="flex items-center gap-2 py-2 text-sm">
      <span className="text-foreground">
        {capitalize(block.type)} · {formatDuration(block.durationSec)}
      </span>
      {zone ? (
        /* FTP set: zone pill badge */
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {zone.label} / {zone.name}
        </span>
      ) : (
        /* FTP absent: plain RPE descriptor */
        <span className="text-muted-foreground">{block.rpe}</span>
      )}
    </div>
  );
}
