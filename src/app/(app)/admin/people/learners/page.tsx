import type { Metadata } from "next";
import Link from "next/link";
import { selectClass } from "@/components/platform/form-bits";
import { StatusPill } from "@/components/people/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { LEARNER_STATUSES, LEARNER_STATUS_LABELS } from "@/lib/people/person-input";
import type { LearnerStatus } from "@/lib/people/person-input";
import { isUuid } from "@/lib/setup/structure";
import { currentYear, listYearClasses, requireSchoolAdmin, searchLearners } from "../data";

export const metadata: Metadata = { title: "Learners" };

const fieldClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** US-3.3: the school's learners, searchable by name or number, by class and status. */
export default async function LearnersPage({ searchParams }: PageProps<"/admin/people/learners">) {
  const { schoolId } = await requireSchoolAdmin();
  const params = await searchParams;
  const query = one(params.q).slice(0, 100);
  const classId = isUuid(one(params.class)) ? one(params.class) : null;
  const statusParam = one(params.status);
  const status: LearnerStatus | "all" =
    statusParam === "all" || (LEARNER_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as LearnerStatus | "all")
      : "active";

  const year = await currentYear(schoolId);
  const classes = year ? await listYearClasses(year.id) : [];
  const { learners, total } = await searchLearners({
    schoolId,
    yearId: year?.id ?? null,
    query,
    classId,
    status,
  });
  const filtered = Boolean(query || classId || status !== "active");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/people/learners/new"
          className={buttonVariants({ className: "h-11 rounded-full px-5 text-base" })}
        >
          Add a learner
        </Link>
        <Link
          href="/admin/people/import"
          className={buttonVariants({
            variant: "outline",
            className: "h-11 rounded-full px-5 text-base",
          })}
        >
          Import learners
        </Link>
      </div>

      <form role="search" aria-label="Find learners" className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            Name or learner number
          </label>
          <input id="q" name="q" type="search" defaultValue={query} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="class" className="text-sm font-medium">
            Class{year ? ` (${year.label})` : ""}
          </label>
          <select id="class" name="class" defaultValue={classId ?? ""} className={selectClass}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className={selectClass}>
            {LEARNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEARNER_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">Everyone</option>
          </select>
        </div>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", className: "h-12 text-base sm:w-fit" })}
        >
          Search
        </button>
      </form>

      <p className="text-muted-foreground text-sm" role="status">
        {total === 0
          ? filtered
            ? "No learners match."
            : "No learners yet. Add one, or import a class list."
          : total > learners.length
            ? `Showing ${learners.length} of ${total} learners. Search to narrow the list.`
            : `${total} ${total === 1 ? "learner" : "learners"}`}
      </p>

      {learners.length > 0 && (
        <ul aria-label="Learners" className="bg-card divide-y rounded-2xl border">
          {learners.map((l) => (
            <li key={l.id}>
              <Link
                href={`/admin/people/learners/${l.id}`}
                className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-3"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted-foreground text-sm">{l.learnerNumber}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {l.className ?? <span className="text-muted-foreground">No class</span>}
                  {l.status !== "active" && (
                    <StatusPill tone="muted">{LEARNER_STATUS_LABELS[l.status]}</StatusPill>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
