"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

/** Re-sends a school admin's invite email while the invite is not accepted yet (D14). */
export function ResendInviteForm({
  action,
  email,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  email: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="h-11 w-full text-base sm:w-fit"
        aria-label={email ? `Resend invite to ${email}` : undefined}
      >
        {pending ? "Sending…" : "Resend invite"}
      </Button>
    </form>
  );
}
