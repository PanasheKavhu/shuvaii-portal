"use client";

import { useActionState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

/** The school's privacy notice contact (Q20; D56). */
export function PrivacyContactForm({
  action,
  name,
  email,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field
        id="privacyName"
        label="Contact name"
        hint="A person or an office, for example The Bursar."
        error={state.errors.name}
      >
        <Input
          id="privacyName"
          name="name"
          defaultValue={name}
          autoComplete="off"
          required
          className={inputClass}
          {...describedBy("privacyName", state.errors.name, "hint")}
        />
      </Field>
      <Field id="privacyEmail" label="Contact email" error={state.errors.email}>
        <Input
          id="privacyEmail"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={email}
          autoComplete="off"
          required
          className={inputClass}
          {...describedBy("privacyEmail", state.errors.email)}
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base sm:w-fit sm:px-6">
        {pending ? "Saving…" : "Save privacy contact"}
      </Button>
    </form>
  );
}
