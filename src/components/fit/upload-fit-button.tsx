"use client";

/**
 * UploadFitButton — Client Component for .fit file upload (D-03, D-11, D-13, UPLOAD-01/02/03).
 *
 * Responsibilities:
 *   - Hidden file input triggers multipart POST to /api/fit/upload (Wave 2 handler)
 *   - Upload state machine: idle → uploading → success | error
 *   - Inline confirmation: matched ("Logged — matched to {title}") or unmatched
 *   - Error mapping: 413 → UPLOAD_ERROR_TOO_LARGE, 400 invalid_fit_file →
 *     UPLOAD_ERROR_INVALID, else → UPLOAD_ERROR_GENERIC
 *   - Renders recentUploads list with per-row Delete button via deleteUploadAction
 *   - router.refresh() after successful upload or delete to re-render RSC chart
 *
 * Content-Type: NOT set manually — browser sets multipart boundary automatically.
 * FormData key: 'file' (must match formData.get('file') in the Route Handler).
 * Delete: direct (no confirm modal — per RESEARCH Open Question 2: re-upload is low cost).
 *
 * References: UPLOAD-01, UPLOAD-02, UPLOAD-03, D-03, D-09, D-11, D-13
 */

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { COPY } from "@/lib/copy";
import { deleteUploadAction } from "@/lib/actions/fit";

export interface RecentUpload {
  id: string;
  fileName: string;
  matchedSessionTitle: string | null;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

interface UploadFitButtonProps {
  recentUploads: RecentUpload[];
}

export function UploadFitButton({
  recentUploads,
}: UploadFitButtonProps): React.JSX.Element {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
  });
  const [isPending, startTransition] = useTransition();

  const isUploading = uploadState.status === "uploading";

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected after an error
    e.target.value = "";

    setUploadState({ status: "uploading" });

    try {
      const formData = new FormData();
      formData.append("file", file); // key must match Route Handler's formData.get('file')

      const res = await fetch("/api/fit/upload", {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type — browser sets multipart boundary automatically
      });

      if (res.ok) {
        const json = await res.json();
        const message =
          json.matchedSessionId !== null
            ? COPY.UPLOAD_SUCCESS_MATCHED.replace(
                "{title}",
                json.matchedSessionTitle ?? json.matchedSessionId
              )
            : COPY.UPLOAD_SUCCESS_UNMATCHED;

        setUploadState({ status: "success", message });
        router.refresh(); // Re-fetch RSC so chart updates
      } else {
        let message: string = COPY.UPLOAD_ERROR_GENERIC;
        if (res.status === 413) {
          message = COPY.UPLOAD_ERROR_TOO_LARGE;
        } else if (res.status === 400) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === "invalid_fit_file") {
            message = COPY.UPLOAD_ERROR_INVALID;
          }
        }
        setUploadState({ status: "error", message });
      }
    } catch {
      setUploadState({ status: "error", message: COPY.UPLOAD_ERROR_GENERIC });
    }
  }

  function handleDelete(uploadId: string) {
    startTransition(async () => {
      await deleteUploadAction(uploadId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input — only .fit files accepted */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".fit"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Upload button */}
      <Button
        onClick={handleButtonClick}
        disabled={isUploading || isPending}
        size="lg"
        className="w-full min-h-[44px]"
      >
        {isUploading ? COPY.UPLOAD_BTN_LOADING : COPY.UPLOAD_BTN}
      </Button>

      {/* Inline confirmation (success) */}
      {uploadState.status === "success" && (
        <p className="text-sm text-muted-foreground">{uploadState.message}</p>
      )}

      {/* Inline error */}
      {uploadState.status === "error" && (
        <ErrorBanner message={uploadState.message} />
      )}

      {/* Recent uploads list with per-row Delete */}
      {recentUploads.length > 0 && (
        <ul className="space-y-2">
          {recentUploads.map((upload) => (
            <li
              key={upload.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">
                {upload.fileName}
                {upload.matchedSessionTitle && (
                  <span className="ml-2 text-muted-foreground">
                    · {upload.matchedSessionTitle}
                  </span>
                )}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(upload.id)}
                disabled={isPending}
                className="shrink-0 min-h-[44px]"
              >
                {COPY.UPLOAD_DELETE_BTN}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
