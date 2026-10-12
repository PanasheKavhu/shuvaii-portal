"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { makeCurrentYear } from "@/app/(app)/admin/setup/actions";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

/**
 * The last step of a rollover (US-3.5, D52): the next year becomes the
 * school's current year only when the admin ticks that they have checked it
 * and confirms. Until then teachers and families keep seeing the old year.
 */
export function MakeCurrentYear({
  yearId,
  label,
  fromLabel,
}: {
  yearId: string;
  label: string;
  fromLabel: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState<FormState>(idle);
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-labelledby="make-current-heading"
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h2 id="make-current-heading" className="text-lg font-semibold">
        Make {label} the current year
      </h2>
      <p className="text-muted-foreground text-sm">
        Until you do, teachers, learners and parents still see {fromLabel}. Check the {label}{" "}
        classes, teachers, subjects and terms in School setup first.
      </p>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>I have checked {label} and want to make it current</span>
      </label>
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="button"
        className="h-12 text-base"
        disabled={!checked || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await makeCurrentYear(yearId);
            setState(result);
            if (result.status === "saved") router.push(`/admin/setup/${yearId}`);
          })
        }
      >
        {pending ? "Saving…" : `Make ${label} current`}
      </Button>
    </section>
  );
}
