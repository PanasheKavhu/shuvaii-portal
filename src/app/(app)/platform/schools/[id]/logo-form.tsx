"use client";

import { useActionState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

const HINT = "PNG, JPEG or WebP, up to 1 MB. A square image works best.";

/** US-1.5 logo upload into the public school-branding bucket. */
export function LogoForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field id="logo" label="Logo image" hint={HINT} error={state.errors.logo}>
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className={`${inputClass} py-2.5`}
          {...describedBy("logo", state.errors.logo, HINT)}
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" variant="outline" disabled={pending} className="h-12 text-base">
        {pending ? "Uploading…" : "Upload logo"}
      </Button>
    </form>
  );
}
