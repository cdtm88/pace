"use client";

/**
 * SessionGenerator — dashboard AI session generation UI (D-11, D-12, D-13).
 *
 * Tap-selector (D-11):
 *   Four buttons: "0 — Flat", "1 — OK", "2 — Good", "3 — Fresh".
 *   Selected score highlighted with variant="default"; others variant="outline".
 *   Generate button gated until a score is selected.
 *
 * Generation (D-12):
 *   Uses useTransition for non-form imperative Server Action call (RESEARCH Pattern 6).
 *   Not the form-submission hook — this is an imperative non-form call (RESEARCH Pattern 6).
 *   Spinner overlay on the button while pending; no page redirect on success.
 *
 * Result rendering (D-12, D-13):
 *   Success: compact Card with title, formatted duration, block count.
 *   Error: ErrorBanner with the action's error string (covers GEN-02 fallback + GEN-03 limit).
 *   Technical details (debug JSON, Zod issues, safety reasons) are never surfaced in the UI.
 *
 * Security:
 *   Only readinessScore (0–3) is sent to generateSessionAction.
 *   All auth, profile, rate limit, and validation happen server-side.
 *   API key never reaches this client component.
 */

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { generateSessionAction } from "@/lib/actions/session";
import type { GeneratedSession } from "@/lib/db/schemas/session";

/** The display-safe subset of a training session row for summary rendering. */
type SessionSummary = {
  title: string;
  totalDurationSec: number;
  blocks: unknown;
};

type ActionResult =
  | { data: SessionSummary & Record<string, unknown>; error?: undefined }
  | { data?: undefined; error: string };

interface ReadinessOption {
  score: number;
  label: string;
}

const READINESS_OPTIONS: ReadinessOption[] = [
  { score: 0, label: "0 — Flat" },
  { score: 1, label: "1 — OK" },
  { score: 2, label: "2 — Good" },
  { score: 3, label: "3 — Fresh" },
];

/** Format total duration in seconds to human-readable "X min" or "Xh Ym". */
function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface SessionGeneratorProps {
  profile: {
    ftp: number | null;
    goals: string | null;
    injuries: string | null;
    weight: number | null;
    onboardingComplete: boolean;
  } | null;
}

export function SessionGenerator({ profile }: SessionGeneratorProps) {
  const [isPending, startTransition] = useTransition();
  const [readiness, setReadiness] = useState<number | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  function handleGenerate() {
    if (readiness === null) return;

    startTransition(async () => {
      const res = await generateSessionAction(readiness);
      setResult(res as ActionResult);
    });
  }

  // Extract GeneratedSession-compatible fields from the result for display
  const sessionData = result?.data;

  return (
    <div className="space-y-4">
      {/* Tap-selector (D-11) — four readiness buttons */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          How do you feel today?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {READINESS_OPTIONS.map(({ score, label }) => (
            <Button
              key={score}
              type="button"
              variant={readiness === score ? "default" : "outline"}
              className="h-12 text-sm font-medium"
              onClick={() => {
                setReadiness(score);
                // Clear previous result when changing readiness
                setResult(null);
              }}
              aria-pressed={readiness === score}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Generate button (D-12) */}
      <Button
        type="button"
        disabled={isPending || readiness === null}
        aria-busy={isPending}
        className="h-12 w-full text-base font-medium"
        onClick={handleGenerate}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          "Generate Session"
        )}
      </Button>

      {/* Success: compact session summary card (D-12) */}
      {sessionData && (
        <Card>
          <CardHeader>
            <CardTitle>{sessionData.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <dt className="font-medium text-foreground">Duration</dt>
                <dd>{formatDuration(sessionData.totalDurationSec)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="font-medium text-foreground">Blocks</dt>
                <dd>
                  {Array.isArray(sessionData.blocks)
                    ? (sessionData.blocks as GeneratedSession["blocks"]).length
                    : 0}{" "}
                  blocks
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Error: GEN-02 fallback or GEN-03 limit message (D-13) */}
      {result?.error && <ErrorBanner message={result.error} />}
    </div>
  );
}
