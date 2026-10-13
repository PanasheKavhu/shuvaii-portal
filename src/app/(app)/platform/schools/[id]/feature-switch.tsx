"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

/**
 * One feature's switch (US-10.3; D55): its state in words and one button
 * that flips it. The page re-renders with the new state after saving.
 */
export function FeatureSwitch({
  label,
  description,
  on,
  action,
}: {
  label: string;
  description: string;
  on: boolean;
  action: () => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form
      action={formAction}
      className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {label}
          <span
            className={
              on
                ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-sm text-emerald-800 dark:text-emerald-300"
                : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-sm"
            }
          >
            {on ? "On" : "Off"}
          </span>
        </p>
        <p className="text-muted-foreground text-sm">{description}</p>
        <FormMessage status={state.status} message={state.message} />
      </div>
      <Button
        type="submit"
        variant={on ? "outline" : "default"}
        disabled={pending}
        className="h-11 shrink-0 px-5 text-base"
        aria-label={`Switch ${label.toLowerCase()} ${on ? "off" : "on"}`}
      >
        {pending ? "Saving…" : on ? "Switch off" : "Switch on"}
      </Button>
    </form>
  );
}
