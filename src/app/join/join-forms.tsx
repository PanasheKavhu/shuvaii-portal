"use client";

import { useActionState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idle } from "@/app/(app)/platform/form-state";
import { claimWithNewAccount, claimWithThisAccount, type NewParentState } from "./actions";

/**
 * New parent account: name, email and password, then the code is claimed.
 * A plain server-action form, so it posts safely even before the page has
 * loaded its scripts; a rejected form gets the typed name and email back.
 */
export function NewParentForm({
  code,
  fullName,
  email,
  minPasswordLength,
}: {
  code: string;
  fullName: string;
  email: string;
  minPasswordLength: number;
}) {
  const [state, formAction, pending] = useActionState<NewParentState, FormData>(
    claimWithNewAccount.bind(null, code),
    { ...idle, values: null },
  );
  const e = state.errors;
  const typed = state.values ?? { fullName, email };
  const passwordHint = `At least ${minPasswordLength} characters.`;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field id="fullName" label="Your full name" error={e.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          key={`name-${typed.fullName}`}
          defaultValue={typed.fullName}
          className={inputClass}
          {...describedBy("fullName", e.fullName)}
        />
      </Field>
      <Field
        id="email"
        label="Email"
        hint="You sign in with it and get password reset emails there."
        error={e.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          key={`email-${typed.email}`}
          defaultValue={typed.email}
          className={inputClass}
          {...describedBy("email", e.email, "hint")}
        />
      </Field>
      <Field id="password" label="Password" hint={passwordHint} error={e.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
          {...describedBy("password", e.password, passwordHint)}
        />
      </Field>
      <Field id="confirm" label="Confirm password">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Setting up…" : "Create account"}
      </Button>
    </form>
  );
}

/** Someone already signed in adds the children to the account they are using. */
export function ExistingAccountForm({ code, label }: { code: string; label: string }) {
  const [state, formAction, pending] = useActionState(claimWithThisAccount.bind(null, code), idle);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Adding…" : label}
      </Button>
    </form>
  );
}
