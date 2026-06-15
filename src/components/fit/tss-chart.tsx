"use client";

/**
 * TssChart — Weekly TSS bar chart (D-14, D-15, PROG-02).
 *
 * Presentational client component: renders a recharts BarChart or an empty-state
 * label. The dashboard RSC wraps this in a Card and supplies data built server-side
 * via buildWeeklyTSS(findActivityUploadsByUserId(...)).
 *
 * Visual contract (UI-SPEC):
 *   - ResponsiveContainer height=300
 *   - Orange bars: fill="#f97316", radius=[4,4,0,0]
 *   - 12px axis ticks
 *   - X-axis week labels ("Jun 9" format)
 *   - Empty state: centered label from COPY.CHART_TSS_EMPTY_LABEL
 *
 * recharts v3 is SVG-based and safe in a Client Component — no dynamic import
 * needed (RESEARCH Pattern 5).
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { COPY } from "@/lib/copy";
import type { WeeklyTSSPoint } from "@/lib/fit/tss-chart-data";

interface TssChartProps {
  data: WeeklyTSSPoint[];
}

export function TssChart({ data }: TssChartProps): React.JSX.Element {
  const isEmpty = data.length === 0 || data.every((d) => d.tss === 0);

  if (isEmpty) {
    return (
      <div
        aria-label="Weekly training load bar chart, 6-week rolling window"
        className="flex h-[300px] items-center justify-center"
      >
        <p className="text-sm text-muted-foreground">
          {COPY.CHART_TSS_EMPTY_LABEL}
        </p>
      </div>
    );
  }

  return (
    <div aria-label="Weekly training load bar chart, 6-week rolling window">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <XAxis dataKey="week" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="tss" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
