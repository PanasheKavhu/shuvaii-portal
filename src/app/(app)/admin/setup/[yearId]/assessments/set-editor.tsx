"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { FormMessage, selectClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  weightMessage,
  weightTotal,
  type AssessmentDraft,
} from "@/lib/marks/assessments";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

type Row = AssessmentDraft & { key: number };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const cell =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

/**
 * The school's usual set for one term kind (D41): rows of name, type,
 * maximum and weight with a running total that must reach 100 to save.
 */
export function AssessmentSetEditor({
  action,
  label,
  items,
}: {
  action: Action;
  label: string;
  items: readonly AssessmentDraft[];
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(items.length);
  const [rows, setRows] = useState<Row[]>(() => items.map((a, i) => ({ ...a, key: i })));
  const total = weightTotal(rows.map((r) => r.weightPercent));
  const tally = weightMessage(total, rows.length);

  function update(key: number, field: keyof AssessmentDraft, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} aria-label={label} className="flex flex-col gap-3" noValidate>
      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-xl border p-3">
            <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
              <legend className="sr-only">
                {label}, assessment {i + 1}
              </legend>
              <Field
                id={`${label}-name-${row.key}`}
                label="Name"
                n={i + 1}
                className="col-span-2 sm:col-span-1"
              >
                <input
                  id={`${label}-name-${row.key}`}
                  name="name"
                  value={row.name}
                  maxLength={80}
                  onChange={(e) => update(row.key, "name", e.target.value)}
                  className={cell}
                />
              </Field>
              <Field
                id={`${label}-type-${row.key}`}
                label="Type"
                n={i + 1}
                className="col-span-2 sm:col-span-1"
              >
                <select
                  id={`${label}-type-${row.key}`}
                  name="type"
                  value={row.type}
                  onChange={(e) => update(row.key, "type", e.target.value)}
                  className={selectClass}
                >
                  {ASSESSMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ASSESSMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${label}-max-${row.key}`} label="Out of" n={i + 1}>
                <input
                  id={`${label}-max-${row.key}`}
                  name="maxMark"
                  inputMode="decimal"
                  value={row.maxMark}
                  onChange={(e) => update(row.key, "maxMark", e.target.value)}
                  className={cell}
                />
              </Field>
              <Field id={`${label}-weight-${row.key}`} label="Weight (%)" n={i + 1}>
                <input
                  id={`${label}-weight-${row.key}`}
                  name="weightPercent"
                  inputMode="decimal"
                  value={row.weightPercent}
                  onChange={(e) => update(row.key, "weightPercent", e.target.value)}
                  className={cell}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                className="col-span-2 min-h-11 self-end sm:col-span-1"
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              >
                Remove<span className="sr-only"> {row.name || `assessment ${i + 1}`}</span>
              </Button>
            </fieldset>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-fit"
        onClick={() => {
          setRows((rs) => [
            ...rs,
            { key: nextKey, name: "", type: "test", maxMark: "", weightPercent: "" },
          ]);
          setNextKey((k) => k + 1);
        }}
      >
        Add an assessment
      </Button>
      <p
        role="status"
        aria-label={`${label} weight total`}
        className={
          tally.ok
            ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
            : "bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm font-medium"
        }
      >
        {tally.ok ? tally.text : `${tally.text.split(".")[0]}. They must add up to 100 to save.`}
      </p>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Saving…" : `Save ${label.toLowerCase()}`}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  n,
  className,
  children,
}: {
  id: string;
  label: string;
  /** The row number, for the input's accessible name ("Weight (%), assessment 2"). */
  n: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
        <span className="sr-only">, assessment {n}</span>
      </label>
      {children}
    </div>
  );
}
