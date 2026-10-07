"use client";

import { useActionState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

/** US-10.1: invite the school's first admin by email. */
export function InviteForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field id="fullName" label="Full name" error={state.errors.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="off"
          required
          className={inputClass}
          {...describedBy("fullName", state.errors.fullName)}
        />
      </Field>
      <Field id="email" label="Email" error={state.errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          className={inputClass}
          {...describedBy("email", state.errors.email)}
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
