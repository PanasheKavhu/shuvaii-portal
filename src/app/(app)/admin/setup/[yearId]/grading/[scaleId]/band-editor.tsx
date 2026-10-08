"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { checkBands, describeBandProblem } from "@/lib/setup/bands";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

type Row = { key: number; grade: string; minMark: string; maxMark: string; remark: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const cell =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3 aria-invalid:border-destructive";

/**
 * US-2.3 band editor. Checks the bands as you type (the same rule the
 * server and database apply) and lists exactly what is wrong: gaps,
 * overlaps, marks out of range.
 */
export function BandEditor({
  action,
  bands,
  isDefault,
}: {
  action: Action;
  bands: { grade: string; minMark: number; maxMark: number; remark: string | null }[];
  isDefault: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(bands.length);
  const [rows, setRows] = useState<Row[]>(() =>
    bands.map((b, i) => ({
      key: i,
      grade: b.grade,
      minMark: String(b.minMark),
      maxMark: String(b.maxMark),
      remark: b.remark ?? "",
    })),
  );
  const problems = checkBands(rows);
  const badRows = new Set(problems.flatMap((p) => ("row" in p ? [p.row] : [])));

  function update(key: number, field: keyof Omit<Row, "key">, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} aria-label="Grade bands" className="flex flex-col gap-4" noValidate>
      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.key} className="bg-card rounded-2xl border p-3">
            <fieldset className="grid grid-cols-3 gap-3 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]">
              <legend className="sr-only">Band {i + 1}</legend>
              <BandInput
                id={`grade-${row.key}`}
                name="grade"
                label={`Grade, band ${i + 1}`}
                short="Grade"
                value={row.grade}
                invalid={badRows.has(i + 1)}
                onChange={(v) => update(row.key, "grade", v)}
              />
              <BandInput
                id={`min-${row.key}`}
                name="minMark"
                label={`Lowest mark, band ${i + 1}`}
                short="From"
                numeric
                value={row.minMark}
                invalid={badRows.has(i + 1)}
                onChange={(v) => update(row.key, "minMark", v)}
              />
              <BandInput
                id={`max-${row.key}`}
                name="maxMark"
                label={`Highest mark, band ${i + 1}`}
                short="To"
                numeric
                value={row.maxMark}
                invalid={badRows.has(i + 1)}
                onChange={(v) => update(row.key, "maxMark", v)}
              />
              <div className="col-span-3 sm:col-span-1">
                <BandInput
                  id={`remark-${row.key}`}
                  name="remark"
                  label={`Remark, band ${i + 1}`}
                  short="Remark (optional)"
                  value={row.remark}
                  onChange={(v) => update(row.key, "remark", v)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="col-span-3 min-h-11 self-end sm:col-span-1"
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              >
                Remove<span className="sr-only"> band {i + 1}</span>
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
            { key: nextKey, grade: "", minMark: "", maxMark: "", remark: "" },
          ]);
          setNextKey((k) => k + 1);
        }}
      >
        Add a band
      </Button>

      <section aria-label="Band check" aria-live="polite">
        {problems.length === 0 ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            Marks 0 to 100 are each in exactly one band.
          </p>
        ) : (
          <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm font-medium">
            <p>What needs fixing:</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p, i) => (
                <li key={i}>{describeBandProblem(p)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <label className="flex min-h-12 items-center gap-3 text-base">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={isDefault}
          disabled={isDefault}
          className="accent-primary size-5 shrink-0"
        />
        {isDefault
          ? "This is the default scale for its stage"
          : "Make this the default scale for its stage"}
      </label>

      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Saving…" : "Save bands"}
      </Button>
    </form>
  );
}

function BandInput({
  id,
  name,
  label,
  short,
  value,
  onChange,
  numeric,
  invalid,
}: {
  id: string;
  name: string;
  label: string;
  short: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{label}</span>
      </label>
      <input
        id={id}
        name={name}
        value={value}
        inputMode={numeric ? "numeric" : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cell}
      />
    </div>
  );
}
