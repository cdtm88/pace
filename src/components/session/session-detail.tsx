"use client";

/**
 * SessionDetail — three-state on-bike session machine.
 *
 * Sub-states:
 *   "pre-ride" — pre-ride summary: title, badge row, scrollable block list, action row.
 *   "riding"   — full-screen tap-to-advance watt display (D-05, D-09).
 *   "complete" — session complete with "Back to dashboard" link (D-06).
 *
 * Phase 5 will add Strava match status to the complete state.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SessionBlockRow } from "@/components/session/session-block-row";
import { getZoneForWatts } from "@/lib/training/zones";
import { formatDuration } from "@/lib/training/format";
import { COPY } from "@/lib/copy";
import type { GeneratedSession } from "@/lib/db/schemas/session";

type SubState = "pre-ride" | "riding" | "complete";

interface SessionDetailProps {
  session: {
    id: string;
    title: string;
    totalDurationSec: number;
    blocks: unknown;
  };
  blocks: GeneratedSession["blocks"];
  ftp: number | null;
  tss: number | null;
  intensity: "Easy" | "Moderate" | "Hard" | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SessionDetail({
  session,
  blocks,
  ftp,
  tss,
  intensity,
}: SessionDetailProps) {
  const [subState, setSubState] = useState<SubState>("pre-ride");
  const [blockIndex, setBlockIndex] = useState(0);

  function advance() {
    if (blockIndex < blocks.length - 1) {
      setBlockIndex(blockIndex + 1);
    } else {
      setSubState("complete");
    }
  }

  // ── PRE-RIDE view (D-07) ───────────────────────────────────────────────────
  if (subState === "pre-ride") {
    const badge =
      tss !== null
        ? COPY.SESSION_BADGE_TSS.replace("{tss}", String(tss)).replace(
            "{duration}",
            formatDuration(session.totalDurationSec)
          )
        : COPY.SESSION_BADGE_INTENSITY.replace(
            "{intensity}",
            intensity ?? ""
          ).replace("{duration}", formatDuration(session.totalDurationSec));

    return (
      <main className="flex min-h-screen flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-4 pt-8 pb-24">
          <div className="mx-auto max-w-lg space-y-4">
            {/* Session title */}
            <h1 className="text-xl font-semibold text-foreground">
              {session.title}
            </h1>

            {/* Badge row: TSS + duration or intensity + duration */}
            <p className="text-sm text-muted-foreground">{badge}</p>

            {/* Scrollable block list */}
            <div className="divide-y divide-border">
              {blocks.map((block) => (
                <SessionBlockRow key={block.order} block={block} ftp={ftp} />
              ))}
            </div>
          </div>
        </div>

        {/* Sticky action row — 64px, Export + Start (D-07) */}
        <div className="sticky bottom-0 flex h-16 items-center gap-3 border-t border-border bg-background px-4">
          <Button variant="outline" className="flex-1" asChild>
            <a href={`/api/session/${session.id}/export`} download>
              {COPY.SESSION_PRE_RIDE_EXPORT_BTN}
            </a>
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={() => {
              setBlockIndex(0);
              setSubState("riding");
            }}
          >
            {COPY.SESSION_PRE_RIDE_START_BTN}
          </Button>
        </div>
      </main>
    );
  }

  // ── RIDING view (D-05, D-09) ───────────────────────────────────────────────
  if (subState === "riding") {
    const currentBlock = blocks[blockIndex];
    const zone = getZoneForWatts(currentBlock.targetWatts, ftp);
    const zoneOrRpe = zone
      ? `${zone.label} / ${zone.name}`
      : currentBlock.rpe;

    const counter = COPY.SESSION_BLOCK_COUNTER.replace(
      "{current}",
      String(blockIndex + 1)
    ).replace("{total}", String(blocks.length));

    return (
      /* Full-screen container — entire area is the tap target (D-05) */
      <div
        className="flex min-h-dvh cursor-pointer select-none flex-col items-center justify-center bg-background"
        onClick={advance}
        role="button"
        aria-label={`Block ${blockIndex + 1} of ${blocks.length}. Tap to advance.`}
      >
        {/* Block counter — top, pushed up via mb-auto */}
        <p className="mb-auto pt-8 text-sm text-muted-foreground">{counter}</p>

        {/* Large watt numeral — primary display (D-09) */}
        <p className="text-[120px] font-black leading-none tabular-nums text-foreground">
          {currentBlock.targetWatts}
        </p>

        {/* Zone or RPE label */}
        <p className="mt-2 text-sm text-muted-foreground">{zoneOrRpe}</p>

        {/* Block type + duration */}
        <p className="mt-1 pb-8 text-xs text-muted-foreground">
          {capitalize(currentBlock.type)} · {formatDuration(currentBlock.durationSec)}
        </p>
      </div>
    );
  }

  // ── COMPLETE view (D-06) ───────────────────────────────────────────────────
  // Phase 5 will add Strava match status here.
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{COPY.SESSION_COMPLETE_HEADING}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="default"
            className="w-full"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            {COPY.SESSION_COMPLETE_BACK}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
