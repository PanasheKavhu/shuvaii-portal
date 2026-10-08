"use client";

import { useActionState, type ReactNode } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { noSecret, type SecretState } from "@/app/(app)/admin/people/secret-state";

/**
 * A button that makes a parent code or learner PIN and shows it once, large
 * enough to read out or copy onto a slip (US-1.2, US-1.3).
 */
export function OneTimeSecretForm({
  action,
  submitLabel,
  pendingLabel = "Making…",
  label,
  children,
}: {
  action: () => Promise<SecretState>;
  submitLabel: string;
  pendingLabel?: string;
  label: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, noSecret);

  return (
    <form action={formAction} aria-label={label} className="flex flex-col gap-3">
      {children}
      {state.secret ? (
        <div role="status" className="bg-muted/50 flex flex-col gap-1 rounded-xl border p-4">
          <span className="text-muted-foreground text-sm">{state.secret.label}</span>
          <span className="font-mono text-2xl font-semibold tracking-wider break-all">
            {state.secret.value}
          </span>
          {state.secret.details.map((d) => (
            <span key={d} className="text-muted-foreground text-sm break-all">
              {d}
            </span>
          ))}
        </div>
      ) : (
        <FormMessage status={state.status} message={state.message} />
      )}
      <Button type="submit" variant="outline" disabled={pending} className="h-12 text-base">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
