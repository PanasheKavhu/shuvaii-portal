"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/(app)/platform/form-state";
import { idle } from "@/app/(app)/platform/form-state";

export type TwoFactorRow = {
  userId: string;
  name: string;
  detail: string;
  enrolled: boolean;
  lastReset: string | null;
  /** Null for the signed-in super admin, who uses their own recovery codes. */
  reset: ((prev: FormState, formData: FormData) => Promise<FormState>) | null;
};

/** Who must use two-factor sign in, whether they set it up, and a reset (D54). */
export function TwoFactorPeople({ rows, label }: { rows: TwoFactorRow[]; label: string }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No one yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {rows.map((row) => (
        <li key={row.userId} className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-3">
          <div className="flex flex-col">
            <span className="font-medium">{row.name}</span>
            <span className="text-muted-foreground text-sm break-words">{row.detail}</span>
            <span className="text-sm">
              {row.enrolled ? "Authenticator app set up" : "Not set up yet"}
              {row.lastReset && ` · last reset ${row.lastReset}`}
            </span>
          </div>
          {row.reset ? (
            <ResetForm action={row.reset} name={row.name} />
          ) : (
            <p className="text-muted-foreground text-sm">
              This is you: use one of your recovery codes if you lose your phone.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ResetForm({
  action,
  name,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [confirming, setConfirming] = useState(false);

  if (state.status === "saved")
    return <FormMessage status={state.status} message={state.message} />;
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full text-base sm:w-fit"
        onClick={() => setConfirming(true)}
        aria-label={`Reset two-factor sign in for ${name}`}
      >
        Reset two-factor
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-sm">
        {name} will be signed out everywhere and must set up their authenticator app again. Only do
        this once you are sure it is them asking.
      </p>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={pending} className="h-11 text-base">
          {pending ? "Resetting…" : "Yes, reset"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-base"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
