"use client";

/**
 * OnboardingWizard — 3-step client component for /onboarding.
 *
 * Step navigation:
 *   - Step 1: Goals (required textarea) → Next validates non-empty
 *   - Step 2: Injuries (optional textarea) → Next/Back, no validation
 *   - Step 3: FTP + Weight (both optional inputs) → Submit triggers saveProfileAction
 *
 * State management:
 *   - All field values held in `data` state (carry across steps via hidden inputs)
 *   - Step stored in `data.step`
 *   - Inline goal error stored in `goalsError`
 *
 * Form pattern (Pattern 4 — RESEARCH.md):
 *   - useActionState(saveProfileAction, null) for final step
 *   - SubmitButton is a child component — useFormStatus only works inside <form>
 *   - Back/Next buttons are type="button" to prevent accidental form submit
 *
 * iOS auto-zoom (PWA-05): All inputs/textareas use text-base (16px font-size).
 */
import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { saveProfileAction } from "@/lib/actions/profile";
import { COPY } from "@/lib/copy";

/** Submit button — must be a child of <form> for useFormStatus to work. */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-12 w-full text-base font-medium"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {COPY.ONBOARDING_CTA_LOADING}
        </>
      ) : (
        COPY.ONBOARDING_CTA_SUBMIT
      )}
    </Button>
  );
}

export function OnboardingWizard() {
  const [data, setData] = useState({
    step: 1,
    goals: "",
    injuries: "",
    ftp: "",
    weight: "",
  });
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [state, formAction] = useActionState(saveProfileAction, null);

  function handleNextStep1() {
    if (!data.goals.trim()) {
      setGoalsError(COPY.FIELD_ERROR_GOALS_REQUIRED);
      return;
    }
    setGoalsError(null);
    setData((d) => ({ ...d, step: 2 }));
  }

  function handleNextStep2() {
    setData((d) => ({ ...d, step: 3 }));
  }

  function handleBack(toStep: number) {
    setData((d) => ({ ...d, step: toStep }));
  }

  const progressValue = (data.step / 3) * 100;
  const stepLabel = COPY.STEP_COUNTER.replace("{n}", String(data.step));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      {/* Wordmark — 28px/700, zinc-50 (UI-SPEC §Typography Display) */}
      <p className="mb-4 text-[28px] font-bold leading-[1.1] tracking-tight text-foreground">
        {COPY.WORDMARK}
      </p>

      {/* Progress bar — h-2 thin indicator (UI-SPEC §Spacing) */}
      <div className="mb-1 w-full max-w-lg">
        <Progress value={progressValue} className="h-2 w-full" />
      </div>

      {/* Step counter — right-aligned, text-sm muted (UI-SPEC §Typography) */}
      <p className="mb-4 w-full max-w-lg text-right text-sm text-muted-foreground">
        {stepLabel}
      </p>

      {/* Wizard card — max-w-lg (wider than auth max-w-sm for textarea room) */}
      <Card className="w-full max-w-lg bg-card">
        <CardContent className="p-8">
          {/* Step 1: Training Goals */}
          {data.step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold leading-[1.2] text-foreground">
                  {COPY.ONBOARDING_STEP1_HEADING}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {COPY.ONBOARDING_STEP1_HELPER}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="goals-field"
                  className="text-base font-medium text-foreground"
                >
                  {COPY.FIELD_LABEL_GOALS}
                </Label>
                <Textarea
                  id="goals-field"
                  name="goals"
                  value={data.goals}
                  onChange={(e) =>
                    setData((d) => ({ ...d, goals: e.target.value }))
                  }
                  placeholder={COPY.FIELD_PLACEHOLDER_GOALS}
                  className="min-h-[120px] text-base"
                  aria-describedby={goalsError ? "goals-error" : undefined}
                  aria-invalid={!!goalsError}
                  autoComplete="off"
                />
                {goalsError && (
                  <p id="goals-error" className="text-sm text-destructive">
                    {goalsError}
                  </p>
                )}
              </div>

              <Button
                type="button"
                className="h-12 w-full text-base font-medium"
                onClick={handleNextStep1}
              >
                {COPY.ONBOARDING_CTA_NEXT}
              </Button>
            </div>
          )}

          {/* Step 2: Injury & Health Notes */}
          {data.step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold leading-[1.2] text-foreground">
                  {COPY.ONBOARDING_STEP2_HEADING}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {COPY.ONBOARDING_STEP2_HELPER}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="injuries-field"
                  className="text-base font-medium text-foreground"
                >
                  {COPY.FIELD_LABEL_INJURIES}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({COPY.FIELD_OPTIONAL_LABEL})
                  </span>
                </Label>
                <Textarea
                  id="injuries-field"
                  name="injuries"
                  value={data.injuries}
                  onChange={(e) =>
                    setData((d) => ({ ...d, injuries: e.target.value }))
                  }
                  placeholder={COPY.FIELD_PLACEHOLDER_INJURIES}
                  className="min-h-[100px] text-base"
                  autoComplete="off"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 flex-1 text-base"
                  onClick={() => handleBack(1)}
                >
                  {COPY.ONBOARDING_CTA_BACK}
                </Button>
                <Button
                  type="button"
                  className="h-12 flex-1 text-base font-medium"
                  onClick={handleNextStep2}
                >
                  {COPY.ONBOARDING_CTA_NEXT}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: FTP & Weight — wrapped in form for Server Action */}
          {data.step === 3 && (
            <form action={formAction} className="space-y-6">
              {/* Hidden inputs carry goals/injuries from earlier steps */}
              <input type="hidden" name="goals" value={data.goals} />
              <input type="hidden" name="injuries" value={data.injuries} />

              <div>
                <h1 className="text-2xl font-semibold leading-[1.2] text-foreground">
                  {COPY.ONBOARDING_STEP3_HEADING}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {COPY.ONBOARDING_STEP3_HELPER}
                </p>
              </div>

              <div className="space-y-4">
                {/* FTP field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="ftp-field"
                    className="text-base font-medium text-foreground"
                  >
                    {COPY.FIELD_LABEL_FTP}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({COPY.FIELD_OPTIONAL_LABEL})
                    </span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="ftp-field"
                      name="ftp"
                      type="number"
                      inputMode="numeric"
                      min={50}
                      max={700}
                      placeholder={COPY.FIELD_PLACEHOLDER_FTP}
                      value={data.ftp}
                      onChange={(e) =>
                        setData((d) => ({ ...d, ftp: e.target.value }))
                      }
                      className="h-12 text-base"
                      autoComplete="off"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {COPY.FIELD_UNIT_FTP}
                    </span>
                  </div>
                </div>

                {/* Weight field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="weight-field"
                    className="text-base font-medium text-foreground"
                  >
                    {COPY.FIELD_LABEL_WEIGHT}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({COPY.FIELD_OPTIONAL_LABEL})
                    </span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="weight-field"
                      name="weight"
                      type="number"
                      inputMode="decimal"
                      min={30}
                      max={250}
                      placeholder={COPY.FIELD_PLACEHOLDER_WEIGHT}
                      value={data.weight}
                      onChange={(e) =>
                        setData((d) => ({ ...d, weight: e.target.value }))
                      }
                      className="h-12 text-base"
                      autoComplete="off"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {COPY.FIELD_UNIT_WEIGHT}
                    </span>
                  </div>
                </div>
              </div>

              {/* Server Action error banner — above submit row (UI-SPEC §Error Handling) */}
              {state?.errors && (
                <ErrorBanner message={COPY.AUTH_ERROR_SERVER} />
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 flex-1 text-base"
                  onClick={() => handleBack(2)}
                >
                  {COPY.ONBOARDING_CTA_BACK}
                </Button>
                <div className="flex-1">
                  <SubmitButton />
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
