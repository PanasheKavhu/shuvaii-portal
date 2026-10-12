"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS_TEXT,
  ATTACHMENT_MAX_COUNT,
  precheckAttachment,
} from "@/lib/announcements/attachments";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

/**
 * Adds one file to an announcement (US-8.3; D50). The limits are shown
 * before anything is chosen, and a file of the wrong type or over 5 MB is
 * refused here without uploading; the server checks the bytes again.
 */
export function AttachmentUpload({
  action,
  existingCount,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  existingCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [localError, setLocalError] = useState<string | null>(null);
  const full = existingCount >= ATTACHMENT_MAX_COUNT;
  const error = localError ?? state.errors.file;

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    const checked = file ? precheckAttachment(file, existingCount) : { ok: true as const };
    setLocalError(checked.ok ? null : checked.error);
  }

  return (
    <form
      action={formAction}
      aria-label="Attach a file"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
        const file = input?.files?.[0] ?? null;
        const checked = precheckAttachment(file, existingCount);
        if (!checked.ok) {
          event.preventDefault();
          setLocalError(checked.error);
        }
      }}
    >
      <label htmlFor="attachment-file" className="text-sm font-medium">
        Attach a file
      </label>
      <p id="attachment-hint" className="text-muted-foreground text-sm">
        {ATTACHMENT_LIMITS_TEXT} {existingCount} of {ATTACHMENT_MAX_COUNT} used.
      </p>
      <input
        id="attachment-file"
        name="file"
        type="file"
        accept={ATTACHMENT_ACCEPT}
        disabled={full}
        onChange={onChange}
        aria-describedby={error ? "attachment-error" : "attachment-hint"}
        aria-invalid={error ? true : undefined}
        className="file:bg-muted file:text-foreground border-input min-h-12 w-full rounded-lg border px-3 py-2.5 text-base file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {error && (
        <p id="attachment-error" role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending || full || !!localError}
        className="h-12 text-base"
      >
        {full ? "3 files attached" : pending ? "Uploading…" : "Upload file"}
      </Button>
    </form>
  );
}
