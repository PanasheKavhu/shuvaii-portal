import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { selectClass } from "@/components/platform/form-bits";
import { buttonVariants } from "@/components/ui/button";
import { auditQuery, decodeCursor, hasFilters, parseAuditFilters } from "@/lib/audit/filters";
import {
  findLearners,
  learnerById,
  loadAuditPage,
  loadFilterOptions,
  requireAuditViewer,
} from "./data";

export const metadata: Metadata = { title: "Audit log" };

const fieldClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

/**
 * The school's audit log for school admin and head (D35): newest first, in
 * plain words, filtered by learner, class, the person who made the change
 * and date, 50 at a time.
 */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { schoolId, schoolName } = await requireAuditViewer();
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const before = decodeCursor(params.before);

  // A typed learner that matches exactly one learner becomes the filter.
  let matches: Awaited<ReturnType<typeof findLearners>> = [];
  if (!filters.learnerId && filters.learnerQuery) {
    matches = await findLearners(schoolId, filters.learnerQuery);
    if (matches.length === 1) {
      redirect(`/admin/audit${auditQuery({ ...filters, learnerId: matches[0]!.id })}`);
    }
  }
  const choosing = Boolean(filters.learnerQuery && !filters.learnerId);

  const [options, learner, page] = await Promise.all([
    loadFilterOptions(schoolId),
    filters.learnerId ? learnerById(schoolId, filters.learnerId) : null,
    choosing ? null : loadAuditPage(schoolId, filters, before),
  ]);
  const withoutLearner = { ...filters, learnerId: null, learnerQuery: "" };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground mt-1">
          Every change to marks, comments, learners and staff, newest first.
        </p>
      </div>

      <details open={hasFilters(filters)} className="group bg-card rounded-2xl border">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-medium">
          {hasFilters(filters) ? "Filters (on)" : "Filter changes"}
          <span
            aria-hidden
            className="text-muted-foreground transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <form
          role="search"
          aria-label="Filter the audit log"
          action="/admin/audit"
          className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filters.learnerId ? (
            <input type="hidden" name="learner" value={filters.learnerId} />
          ) : null}
          <div className="flex flex-col gap-2">
            <label htmlFor="q" className="text-sm font-medium">
              Learner (name or number)
            </label>
            {filters.learnerId ? (
              <p className="bg-muted/40 flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3">
                <span data-testid="learner-filter">
                  {learner ? `${learner.name} (${learner.number})` : "Unknown learner"}
                </span>
                <Link
                  href={`/admin/audit${auditQuery(withoutLearner)}`}
                  className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                >
                  Clear
                </Link>
              </p>
            ) : (
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={filters.learnerQuery}
                className={fieldClass}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="class" className="text-sm font-medium">
              Class
            </label>
            <select
              id="class"
              name="class"
              defaultValue={filters.classId ?? ""}
              className={selectClass}
            >
              <option value="">All classes</option>
              {options.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="actor" className="text-sm font-medium">
              Changed by
            </label>
            <select
              id="actor"
              name="actor"
              defaultValue={filters.actorId ?? ""}
              className={selectClass}
            >
              <option value="">Anyone</option>
              {options.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="from" className="text-sm font-medium">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={filters.from ?? ""}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="to" className="text-sm font-medium">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={filters.to ?? ""}
              className={fieldClass}
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className={buttonVariants({ className: "h-12 flex-1 text-base sm:flex-none" })}
            >
              Show changes
            </button>
            {hasFilters(filters) && (
              <Link
                href="/admin/audit"
                className={buttonVariants({ variant: "outline", className: "h-12 text-base" })}
              >
                Clear all
              </Link>
            )}
          </div>
        </form>
      </details>

      {choosing && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {matches.length === 0 ? "No learner matches" : "Which learner?"}
          </h2>
          {matches.length > 0 && (
            <ul aria-label="Matching learners" className="bg-card divide-y rounded-2xl border">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/admin/audit${auditQuery({ ...filters, learnerId: m.id })}`}
                    className="hover:bg-muted/60 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground text-sm">{m.number}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {page && (
        <>
          {page.items.length === 0 ? (
            <p
              role="status"
              className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6"
            >
              {hasFilters(filters) || before
                ? "No changes match these filters."
                : "No changes recorded yet."}
            </p>
          ) : (
            <ol aria-label="Changes" className="flex flex-col gap-3">
              {page.items.map(({ id, when, term, line }) => (
                <li key={id} className="bg-card rounded-2xl border p-4 shadow-xs">
                  <p className="font-medium">{line.summary}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {when}
                    {term && ` · ${term}`}
                  </p>
                  {line.changes.length > 0 && (
                    <dl className="mt-3 grid gap-2 text-sm">
                      {line.changes.map((c) => (
                        <div
                          key={c.label}
                          className="bg-muted/40 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 rounded-lg px-3 py-2"
                        >
                          <dt className="font-medium">{c.label}</dt>
                          <dd className="min-w-0 break-words">
                            {c.from !== null && (
                              <>
                                <span className="text-muted-foreground">Old: </span>
                                {c.from}
                                <br />
                              </>
                            )}
                            <span className="text-muted-foreground">New: </span>
                            {c.to ?? "none"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {line.reason && (
                    <p className="mt-3 text-sm">
                      <span className="font-medium">Reason: </span>
                      {line.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <nav aria-label="Pages" className="flex flex-wrap gap-3">
            {before && (
              <Link
                href={`/admin/audit${auditQuery(filters)}`}
                className={buttonVariants({ variant: "outline", className: "h-12 text-base" })}
              >
                Newest
              </Link>
            )}
            {page.next && (
              <Link
                href={`/admin/audit${auditQuery(filters, page.next)}`}
                className={buttonVariants({ variant: "outline", className: "h-12 text-base" })}
              >
                Older changes
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
