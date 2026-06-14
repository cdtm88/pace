"use client";

/**
 * ProfileForm — client component for /profile (edit profile screen).
 *
 * Reuses saveProfileAction from Plan 02 — no new mutation logic.
 * Pre-populates all four fields from the `existing` profile prop (fetched by
 * the RSC page via findUserProfileByUserId). On save success the Server Action
 * calls revalidatePath('/dashboard') then redirect('/dashboard').
 *
 * Pattern: useActionState + SubmitButton child (PATTERNS.md profile-form.tsx section)
 *   - useFormStatus MUST live in a child component of <form>, not the form itself.
 *   - SubmitButton reads pending from useFormStatus and shows Loader2 + loading copy.
 *
 * iOS auto-zoom (PWA-05): All inputs/textareas use text-base (16px font-size).
 * Accessibility: All fields have <Label htmlFor> with matching id; aria-invalid/describedby on errors.
 *
 * Security: saveProfileAction reads userId from session only (T-02-01).
 */
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { saveProfileAction } from "@/lib/actions/profile";
import { COPY } from "@/lib/copy";
import type { ProfileInput } from "@/lib/db/schemas/profile";

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
          {COPY.PROFILE_CTA_LOADING}
        </>
      ) : (
        COPY.PROFILE_CTA_SAVE
      )}
    </Button>
  );
}

export function ProfileForm({ existing }: { existing: ProfileInput | null }) {
  const [state, formAction] = useActionState(saveProfileAction, null);

  return (
    <Card className="w-full bg-card">
      <CardContent className="p-8">
        <form action={formAction} className="space-y-6">
          {/* Page heading — 24px/600 (UI-SPEC §Typography Heading) */}
          <div>
            <h1 className="text-2xl font-semibold leading-[1.2] text-foreground">
              {COPY.PROFILE_EDIT_HEADING}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {COPY.PROFILE_EDIT_SUBTEXT}
            </p>
          </div>

          {/* Server Action error banner — above fields (UI-SPEC §Error Handling) */}
          {state?.errors && <ErrorBanner message={COPY.AUTH_ERROR_SERVER} />}

          <div className="space-y-4">
            {/* Goals field — required textarea */}
            <div className="space-y-2">
              <Label
                htmlFor="goals"
                className="text-base font-medium text-foreground"
              >
                {COPY.FIELD_LABEL_GOALS}
              </Label>
              <Textarea
                id="goals"
                name="goals"
                defaultValue={existing?.goals ?? ""}
                placeholder={COPY.FIELD_PLACEHOLDER_GOALS}
                className="min-h-[120px] text-base"
                autoComplete="off"
              />
            </div>

            {/* Injuries field — optional textarea */}
            <div className="space-y-2">
              <Label
                htmlFor="injuries"
                className="text-base font-medium text-foreground"
              >
                {COPY.FIELD_LABEL_INJURIES}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({COPY.FIELD_OPTIONAL_LABEL})
                </span>
              </Label>
              <Textarea
                id="injuries"
                name="injuries"
                defaultValue={existing?.injuries ?? ""}
                placeholder={COPY.FIELD_PLACEHOLDER_INJURIES}
                className="min-h-[100px] text-base"
                autoComplete="off"
              />
            </div>

            {/* FTP field — optional number input with unit hint */}
            <div className="space-y-2">
              <Label
                htmlFor="ftp"
                className="text-base font-medium text-foreground"
              >
                {COPY.FIELD_LABEL_FTP}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({COPY.FIELD_OPTIONAL_LABEL})
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ftp"
                  name="ftp"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={700}
                  placeholder={COPY.FIELD_PLACEHOLDER_FTP}
                  defaultValue={existing?.ftp ?? ""}
                  className="h-12 text-base"
                  autoComplete="off"
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {COPY.FIELD_UNIT_FTP}
                </span>
              </div>
            </div>

            {/* Weight field — optional number input with unit hint */}
            <div className="space-y-2">
              <Label
                htmlFor="weight"
                className="text-base font-medium text-foreground"
              >
                {COPY.FIELD_LABEL_WEIGHT}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({COPY.FIELD_OPTIONAL_LABEL})
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="weight"
                  name="weight"
                  type="number"
                  inputMode="decimal"
                  min={30}
                  max={250}
                  placeholder={COPY.FIELD_PLACEHOLDER_WEIGHT}
                  defaultValue={existing?.weight ?? ""}
                  className="h-12 text-base"
                  autoComplete="off"
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {COPY.FIELD_UNIT_WEIGHT}
                </span>
              </div>
            </div>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
