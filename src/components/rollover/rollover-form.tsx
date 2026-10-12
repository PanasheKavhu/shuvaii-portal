"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { selectClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import {
  applyRollover,
  previewRollover,
  type RolloverChoices,
  type RolloverState,
} from "@/app/(app)/admin/rollover/actions";
import type { RolloverClassRow } from "@/app/(app)/admin/rollover/data";
import {
  targetValue,
  type ClassTarget,
  type LearnerOutcome,
  type RolloverClass,
  type RolloverLevel,
  type RolloverResult,
} from "@/lib/rollover/plan";
import { MakeCurrentYear } from "./make-current-year";

/**
 * The rollover choices (US-3.5, D53): one card per class with where it goes,
 * and inside it each learner's outcome (moves up by default; repeats,
 * leaves or graduates). "Preview" asks the database what would happen and
 * changes nothing; "Roll over now" does exactly that in one transaction.
 * Any change after a preview clears it, so the admin always applies what
 * they last saw.
 */
export function RolloverForm({
  fromLabel,
  toYear,
  classes,
  nextClasses,
  levels,
  nextYearLearners,
}: {
  fromLabel: string;
  toYear: { id: string; label: string; isCurrent: boolean };
  classes: RolloverClassRow[];
  nextClasses: RolloverClass[];
  levels: RolloverLevel[];
  /** Learners already in the next year: then it can be made current. */
  nextYearLearners: number;
}) {
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(classes.map((c) => [c.id, targetValue(c.proposed)])),
  );
  const [outcomes, setOutcomes] = useState<Record<string, LearnerOutcome>>({});
  const [preview, setPreview] = useState<RolloverState | null>(null);
  const [applied, setApplied] = useState<RolloverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const levelName = new Map(levels.map((l) => [l.id, l.name]));
  const choices: RolloverChoices = { toYearId: toYear.id, targets, outcomes };

  function changed() {
    setPreview(null);
    setError(null);
  }

  if (applied) {
    return (
      <div className="flex flex-col gap-6">
        <section
          aria-labelledby="rolled-over-heading"
          className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
        >
          <h2 id="rolled-over-heading" className="text-lg font-semibold">
            {fromLabel} is rolled over into {toYear.label}
          </h2>
          <p role="status">{countsLine(applied)}</p>
          {applied.classesCreated.length > 0 && (
            <p className="text-muted-foreground text-sm">
              New {toYear.label} classes: {applied.classesCreated.join(", ")}. Check their teachers
              in School setup.
            </p>
          )}
          <NotCarried result={applied} toLabel={toYear.label} links />
        </section>
        {!toYear.isCurrent && (
          <MakeCurrentYear yearId={toYear.id} label={toYear.label} fromLabel={fromLabel} />
        )}
      </div>
    );
  }

  const makeCurrent = nextYearLearners > 0 && !toYear.isCurrent && (
    <MakeCurrentYear yearId={toYear.id} label={toYear.label} fromLabel={fromLabel} />
  );
  if (classes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {makeCurrent}
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          Everyone in {fromLabel} has moved on: nobody is still enrolled in a {fromLabel} class.
        </p>
      </div>
    );
  }

  const previewResult = preview?.status === "done" ? preview.result : null;

  return (
    <div className="flex flex-col gap-6">
      {makeCurrent}
      <ul aria-label={`${fromLabel} classes`} className="flex flex-col gap-4">
        {classes.map((c) => {
          const target = targets[c.id] ?? "skip";
          const options = targetOptions(c, nextClasses, levelName, toYear.label);
          const graduating = target === "graduate";
          const skipped = target === "skip";
          const outcomeLabels: Record<LearnerOutcome, string> = {
            up: `Moves up to ${options.find((o) => o.value === target)?.short ?? "the class above"}`,
            repeat: `Repeats in ${c.repeatsIn}`,
            left: "Leaves the school",
            graduated: "Graduates",
          };
          const changes = c.learners.filter((l) => outcomes[l.enrolmentId]).length;
          return (
            <li key={c.id}>
              <article
                aria-label={c.name}
                className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs"
              >
                <div>
                  <h2 className="text-base font-semibold">{c.name}</h2>
                  <p className="text-muted-foreground text-sm">
                    {c.levelName} · {c.learners.length} learner{c.learners.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor={`target-${c.id}`} className="text-sm font-medium">
                    In {toYear.label}, {c.name}
                  </label>
                  <select
                    id={`target-${c.id}`}
                    className={selectClass}
                    value={target}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTargets({ ...targets, [c.id]: next });
                      if (next === "graduate") {
                        // Nobody moves up from a graduating class.
                        const copy = { ...outcomes };
                        for (const l of c.learners)
                          if (copy[l.enrolmentId] === "up") delete copy[l.enrolmentId];
                        setOutcomes(copy);
                      }
                      changed();
                    }}
                  >
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!skipped && (
                  <details className="group" open={changes > 0 || undefined}>
                    <summary className="text-primary flex min-h-11 cursor-pointer items-center text-sm font-medium">
                      Repeaters, leavers and single learners
                      {changes > 0 && ` (${changes} changed)`}
                    </summary>
                    <ul aria-label={`Learners in ${c.name}`} className="mt-2 flex flex-col">
                      {c.learners.map((l) => {
                        const fallback: LearnerOutcome = graduating ? "graduated" : "up";
                        const value = outcomes[l.enrolmentId] ?? fallback;
                        return (
                          <li
                            key={l.enrolmentId}
                            className="flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                          >
                            <label htmlFor={`outcome-${l.enrolmentId}`} className="min-w-0">
                              <span className="block font-medium">{l.name}</span>
                              <span className="text-muted-foreground block text-xs">
                                {l.learnerNumber}
                              </span>
                            </label>
                            <select
                              id={`outcome-${l.enrolmentId}`}
                              className={`${selectClass} sm:max-w-64`}
                              value={value}
                              onChange={(e) => {
                                const next = e.target.value as LearnerOutcome;
                                const copy = { ...outcomes };
                                if (next === fallback) delete copy[l.enrolmentId];
                                else copy[l.enrolmentId] = next;
                                setOutcomes(copy);
                                changed();
                              }}
                            >
                              {(graduating
                                ? (["graduated", "repeat", "left"] as const)
                                : (["up", "repeat", "left", "graduated"] as const)
                              ).map((o) => (
                                <option key={o} value={o}>
                                  {outcomeLabels[o]}
                                </option>
                              ))}
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      {preview?.status === "error" && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {preview.message}
        </p>
      )}

      {previewResult ? (
        <section
          aria-labelledby="preview-heading"
          className="bg-muted/40 flex flex-col gap-3 rounded-2xl border p-4"
        >
          <h2 id="preview-heading" className="text-lg font-semibold">
            Preview: nothing has changed yet
          </h2>
          <p>{countsLine(previewResult)}</p>
          {previewResult.classesCreated.length > 0 && (
            <p className="text-sm">
              New {toYear.label} classes: {previewResult.classesCreated.join(", ")} (copied with
              their subjects and teachers).
            </p>
          )}
          <MoveList result={previewResult} />
          <NotCarried result={previewResult} toLabel={toYear.label} />
          <Button
            type="button"
            className="h-12 text-base"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await applyRollover(choices);
                if (result.status === "done") setApplied(result.result);
                else setError(result.message);
              })
            }
          >
            {pending ? "Rolling over…" : `Roll over into ${toYear.label}`}
          </Button>
        </section>
      ) : (
        <Button
          type="button"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              setPreview(await previewRollover(choices));
            })
          }
        >
          {pending ? "Checking…" : "Preview"}
        </Button>
      )}
    </div>
  );
}

type TargetOption = { value: string; label: string; short: string };

/** The places a class can go: next year's classes, the proposed new class, graduation, or not now. */
function targetOptions(
  c: RolloverClassRow,
  nextClasses: RolloverClass[],
  levelName: Map<string, string>,
  toLabel: string,
): TargetOption[] {
  const proposed: ClassTarget = c.proposed;
  const options: TargetOption[] = [];
  if (proposed.kind === "new") {
    options.push({
      value: "new",
      label: `Moves up to a new class, ${proposed.name} (${levelName.get(proposed.gradeLevelId) ?? ""})`,
      short: proposed.name,
    });
  }
  for (const n of nextClasses) {
    options.push({
      value: `class:${n.id}`,
      label: `Moves up to ${n.name} (${levelName.get(n.gradeLevelId) ?? toLabel})`,
      short: n.name,
    });
  }
  options.push({ value: "graduate", label: "Graduates (final level)", short: "" });
  options.push({ value: "skip", label: "Not now: leave this class as it is", short: "" });
  return options;
}

function countsLine(r: RolloverResult): string {
  const parts = [
    [r.promoted, "moving up", "moved up"],
    [r.repeating, "repeating", "repeating"],
    [r.left, "leaving", "left"],
    [r.graduated, "graduating", "graduated"],
  ] as const;
  return (
    parts
      .filter(([n]) => n > 0)
      .map(([n, will, did]) => `${n} ${r.applied ? did : will}`)
      .join(", ") + "."
  );
}

function MoveList({ result }: { result: RolloverResult }) {
  const notUp = result.moves.filter((m) => m.outcome !== "promoted");
  if (notUp.length === 0) return null;
  const words: Record<string, string> = {
    repeating: "repeats in",
    left: "leaves the school",
    graduated: "graduates",
  };
  return (
    <ul aria-label="Repeaters, leavers and graduates" className="flex flex-col gap-1 text-sm">
      {notUp.map((m) => (
        <li key={m.learnerNumber}>
          {m.learnerName} ({m.fromClass}) {words[m.outcome] ?? m.outcome}
          {m.outcome === "repeating" && m.toClass ? ` ${m.toClass}` : ""}
        </li>
      ))}
    </ul>
  );
}

function NotCarried({
  result,
  toLabel,
  links = false,
}: {
  result: RolloverResult;
  toLabel: string;
  links?: boolean;
}) {
  if (result.notCarried.length === 0) {
    return <p className="text-sm">Every subject choice carries over into {toLabel}.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Subject choices to sort out</h3>
      <p className="text-muted-foreground text-sm">
        These learners took a subject their {toLabel} class does not teach. Add the subject to the
        class in setup, or choose their subjects again on their page.
      </p>
      <ul aria-label="Subject choices to sort out" className="flex flex-col gap-1 text-sm">
        {result.notCarried.map((n) => (
          <li key={`${n.learnerId}-${n.subject}`}>
            {links ? (
              <Link
                href={`/admin/people/learners/${n.learnerId}`}
                className="text-primary underline"
              >
                {n.learnerName}
              </Link>
            ) : (
              n.learnerName
            )}{" "}
            ({n.learnerNumber}): {n.subject}, not taught in {n.toClass}
          </li>
        ))}
      </ul>
    </div>
  );
}
