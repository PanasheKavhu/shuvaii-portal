"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

/**
 * Suspend or reactivate a school (D63). Suspending asks for a tick first,
 * since it shuts everyone at the school out at once.
 */
export function SchoolStatusForm({
  schoolName,
  suspended,
  action,
}: {
  schoolName: string;
  suspended: boolean;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const confirmError = state.errors.confirm;
  return (
    <form action={formAction} aria-label="School status" className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        Status
        <span
          className={
            suspended
              ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-sm text-amber-900 dark:text-amber-200"
              : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-sm text-emerald-800 dark:text-emerald-300"
          }
        >
          {suspended ? "Suspended" : "Active"}
        </span>
      </p>
      {!suspended && (
        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-suspend" className="flex min-h-12 items-center gap-3 text-base">
            <input
              id="confirm-suspend"
              name="confirm"
              type="checkbox"
              value="yes"
              className="accent-primary size-5 shrink-0"
              aria-invalid={confirmError ? true : undefined}
              aria-describedby={confirmError ? "confirm-suspend-error" : undefined}
            />
            Shut everyone at {schoolName} out until it is reactivated
          </label>
          {confirmError && (
            <p
              id="confirm-suspend-error"
              role="alert"
              className="text-destructive text-sm font-medium"
            >
              {confirmError}
            </p>
          )}
        </div>
      )}
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        variant={suspended ? "default" : "destructive"}
        disabled={pending}
        className="h-11 w-fit px-5 text-base"
      >
        {pending ? "Saving…" : suspended ? "Reactivate school" : "Suspend school"}
      </Button>
    </form>
  );
}
