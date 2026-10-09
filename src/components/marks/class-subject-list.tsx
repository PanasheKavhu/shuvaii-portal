import Link from "next/link";
import { marksProgress } from "@/lib/marks/terms";
import { cn } from "@/lib/utils";

export type ClassSubjectItem = {
  classSubjectId: string;
  className: string;
  subjectName: string;
  teacherName: string | null;
  learners: number;
  assessments: number;
  totalWeight: number;
  marksEntered: number;
  /** Unlocked for the teacher after the lock (admin and head list only). */
  unlocked?: boolean;
};

/**
 * Class subjects with how far their marks are for the term (US-4.2,
 * US-4.8): marks entered out of learners x assessments, and a warning
 * when the weights do not add up to 100. Each links to its marks grid.
 */
export function ClassSubjectList({
  items,
  termId,
  showTeacher = false,
  label,
}: {
  items: readonly ClassSubjectItem[];
  termId: string;
  showTeacher?: boolean;
  label: string;
}) {
  return (
    <ul aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const progress = marksProgress(item);
        const done = progress.expected > 0 && progress.entered === progress.expected;
        const weightsOk = item.assessments > 0 && item.totalWeight === 100;
        return (
          <li key={item.classSubjectId}>
            <Link
              href={`/marks/${item.classSubjectId}/${termId}`}
              className="bg-card hover:border-primary/60 focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-2xl border p-4 shadow-xs transition-colors outline-none focus-visible:ring-3"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-semibold">{item.subjectName}</span>
                  <span className="text-muted-foreground text-sm">
                    {item.className}
                    {showTeacher && ` · ${item.teacherName ?? "No teacher yet"}`}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    done
                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {progress.percent}%
                </span>
              </span>
              <span
                aria-hidden
                className="bg-muted relative h-2 w-full overflow-hidden rounded-full"
              >
                <span
                  className="bg-primary absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </span>
              <span className="text-muted-foreground text-sm">
                {item.assessments === 0
                  ? `No assessments yet · ${item.learners} learners`
                  : `${progress.entered} of ${progress.expected} marks · ${item.learners} learners`}
              </span>
              {item.unlocked && (
                <span className="w-fit rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:text-sky-200">
                  Unlocked for the teacher
                </span>
              )}
              {item.assessments > 0 && !weightsOk && (
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Weights add up to {item.totalWeight}, not 100
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Links to the year's other terms, current one marked. */
export function TermTabs({
  terms,
  current,
  hrefFor,
}: {
  terms: readonly { id: string; name: string }[];
  current: string;
  hrefFor: (termId: string) => string;
}) {
  if (terms.length < 2) return null;
  return (
    <nav aria-label="Terms" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {terms.map((t) => (
          <li key={t.id}>
            <Link
              href={hrefFor(t.id)}
              aria-current={t.id === current ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap",
                t.id === current
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-muted",
              )}
            >
              {t.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
