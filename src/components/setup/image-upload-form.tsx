"use client";

import { useActionState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

const HINT = "PNG, JPEG or WebP, up to 1 MB.";

/** One image upload (the stamp or the head's signature, D43), like the logo form (D15). */
export function ImageUploadForm({
  id,
  label,
  submitLabel,
  action,
}: {
  id: string;
  label: string;
  submitLabel: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label={label} noValidate>
      <Field id={id} label={label} hint={HINT} error={state.errors.image}>
        <Input
          id={id}
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className={`${inputClass} py-2.5`}
          {...describedBy(id, state.errors.image, HINT)}
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" variant="outline" disabled={pending} className="h-12 text-base">
        {pending ? "Uploading…" : submitLabel}
      </Button>
    </form>
  );
}
