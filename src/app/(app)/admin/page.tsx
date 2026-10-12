import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TermTabs } from "@/components/marks/class-subject-list";
import { BrowseSearch } from "@/components/oversight/browse-search";
import {
  byClass,
  byTeacher,
  count,
  isComplete,
  overallTotals,
  weightsWrong,
  type CompletionGroup,
} from "@/lib/marks/completion";
import {
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  describeReports,
  reportTotals,
  type ClassReportStatus,
} from "@/lib/oversight/summary";
import { cn } from "@/lib/utils";
import { resolveTerm } from "../marks/data";
import { loadDashboard, requireOverseer, type Overseer } from "./oversight-data";

export const metadata: Metadata = { title: "Overview" };

/**
 * The school admin's and head's home (US-9.1, D51): what is still missing
 * per class and teacher, reports by status, people counts and the latest
 * changes, each number linking to where it is acted on; and one search box
 * for any learner, staff member or class (US-9.2). A hod sees their own
 * class subjects and classes only (D23, D36). Every section is one
 * set-based call for the whole school; nothing is calculated here.
 */
export default async function OverviewPage({ searchParams }: PageProps<"/admin">) {
  const o = await requireOverseer();
  const { term: wanted } = await searchParams;
  const { terms, term } = await resolveTerm(o.schoolId, wanted);
  const data = await loadDashboard(o, term?.id ?? null);
  const firstName = o.fullName.split(" ")[0];
  const totals = overallTotals(data.classSubjects, data.classes);
  const completionHref = term ? `/marks/completion?term=${term.id}` : "/marks/completion";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">{o.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">
          {firstName ? `Welcome, ${firstName}. ` : ""}
          {term
            ? `${term.name}: ${o.isAdminOrHead ? "the whole school" : "your class subjects and classes"} at a glance.`
            : "Set up this year's terms in school setup to see marks and reports here."}
        </p>
      </div>
      {term && <TermTabs terms={terms} current={term.id} hrefFor={(id) => `/admin?term=${id}`} />}

      <BrowseSearch wholeSchool={o.isAdminOrHead} />

      {data.counts && (
        <Section id="people" title="People">
          <ul aria-label="People counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              id="learners"
              label="Active learners"
              value={data.counts.activeLearners}
              href={o.isAdmin ? "/admin/people/learners" : null}
            />
            <Tile
              id="staff"
              label="Staff"
              value={data.counts.staff}
              href={o.isAdmin ? "/admin/people/staff" : null}
            />
            <Tile
              id="parents"
              label={`Parents linked, of ${data.counts.guardians} guardians`}
              value={data.counts.parentsLinked}
              href="/admin/parents?show=linked"
            />
            <Tile
              id="never-signed-in"
              label="Guardians never signed in"
              value={data.counts.guardiansNeverSignedIn}
              href="/admin/parents?show=never"
              warn
            />
          </ul>
        </Section>
      )}

      {term && (
        <Section
          id="missing"
          title="Marks and comments missing"
          action={{ href: completionHref, label: "Completion" }}
        >
          <ul aria-label="Missing this term" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile id="marks" label="Marks" value={totals.marksMissing} href={completionHref} warn />
            <Tile
              id="comments"
              label="Subject comments"
              value={totals.commentsMissing}
              href={completionHref}
              warn
            />
            {term.kind !== "vacation" && (
              <Tile
                id="class-comments"
                label="Class comments"
                value={totals.classCommentsMissing}
                href={completionHref}
                warn
              />
            )}
            <Tile
              id="weights"
              label="Weights not 100"
              value={totals.weightProblems}
              href={completionHref}
              warn
            />
          </ul>
          {data.classSubjects.length + data.classes.length === 0 ? (
            <Empty>
              {o.isAdminOrHead
                ? "No classes this year yet."
                : "You have no class subjects or classes this year."}
            </Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Gaps
                title="By class"
                groups={byClass(data.classSubjects, data.classes)}
                termId={term.id}
                view="class"
              />
              {o.isAdminOrHead && (
                <Gaps
                  title="By teacher"
                  groups={byTeacher(data.classSubjects, data.classes)}
                  termId={term.id}
                  view="teacher"
                />
              )}
            </div>
          )}
        </Section>
      )}

      {term && data.reports && (
        <Section
          id="reports"
          title="Reports"
          action={o.isHead ? { href: `/head?term=${term.id}`, label: "Head's office" } : undefined}
        >
          <Reports o={o} rows={data.reports} termId={term.id} />
        </Section>
      )}

      {data.activity && (
        <Section
          id="activity"
          title="Latest changes"
          action={{ href: "/admin/audit", label: "Audit log" }}
        >
          {data.activity.length === 0 ? (
            <Empty>No changes recorded yet.</Empty>
          ) : (
            <ol aria-label="Latest changes" className="bg-card divide-y rounded-2xl border">
              {data.activity.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="break-words">{a.line.summary}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {a.when}
                    {a.term && ` · ${a.term}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {o.isAdmin && (
        <Section id="manage" title="Manage">
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/admin/setup",
                label: "School setup",
                text: "Years, terms, grading, subjects, classes and teachers.",
              },
              {
                href: "/admin/people",
                label: "People",
                text: "Learners, guardians and staff, one at a time or from a file.",
              },
              {
                href: "/admin/newsletter",
                label: "Newsletter",
                text: "Announcements for the school, staff, families or a class.",
              },
              {
                href: "/admin/exports",
                label: "Exports",
                text: "Learners, marks and comments as Excel files.",
              },
              {
                href: "/admin/rollover",
                label: "Roll over the year",
                text: "At year end: classes move up, repeaters, leavers and graduates.",
              },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="bg-card hover:bg-muted/40 flex min-h-20 flex-col gap-1 rounded-2xl border p-4"
                >
                  <span className="text-primary font-semibold">{l.label}</span>
                  <span className="text-muted-foreground text-sm">{l.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="text-primary flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Tile({
  id,
  label,
  value,
  href,
  warn = false,
}: {
  id: string;
  label: string;
  value: number;
  href: string | null;
  /** Highlight when not zero: something to do. */
  warn?: boolean;
}) {
  const body = (
    <>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-2xl font-semibold tabular-nums" data-testid={`count-${id}`}>
        {value}
      </span>
    </>
  );
  const box = cn(
    "flex min-h-20 flex-col justify-between rounded-2xl border p-4",
    warn && value > 0 ? "border-amber-500/40 bg-amber-500/10" : "bg-card",
  );
  return (
    <li className="flex">
      {href ? (
        <Link href={href} className={cn(box, "hover:ring-primary/40 w-full hover:ring-2")}>
          {body}
        </Link>
      ) : (
        <div className={cn(box, "w-full")}>{body}</div>
      )}
    </li>
  );
}

/** Classes or teachers with what each still misses; the gaps open their grids. */
function Gaps({
  title,
  groups,
  termId,
  view,
}: {
  title: string;
  groups: CompletionGroup[];
  termId: string;
  view: "class" | "teacher";
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
      <ul aria-label={`Missing by ${view}`} className="bg-card divide-y rounded-2xl border">
        {groups.map((g) => {
          const t = g.totals;
          const parts = [
            t.marksMissing > 0 && count(t.marksMissing, "mark"),
            t.commentsMissing > 0 && count(t.commentsMissing, "comment"),
            t.classCommentsMissing > 0 && count(t.classCommentsMissing, "class comment"),
            t.weightProblems > 0 && `${t.weightProblems} weights not 100`,
          ].filter(Boolean);
          const summary = (
            <span
              className={cn(
                "text-sm",
                isComplete(t)
                  ? "text-emerald-800 dark:text-emerald-300"
                  : "text-amber-900 dark:text-amber-200",
              )}
              data-testid="gap-summary"
            >
              {parts.length ? `${parts.join(" · ")} missing` : "Complete"}
            </span>
          );
          // A teacher's line opens their profile, which lists their grids;
          // listing every class subject twice would double the page.
          if (view === "teacher")
            return (
              <li key={g.key}>
                <a
                  href={
                    g.key === "none"
                      ? `/marks/completion?term=${termId}&by=teacher`
                      : `/admin/browse/staff/${g.key}`
                  }
                  className="hover:bg-muted/40 flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2"
                >
                  <span className="text-primary font-medium">{g.name}</span>
                  {summary}
                </a>
              </li>
            );
          return (
            <li key={g.key}>
              <details>
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                  <span className="font-medium">{g.name}</span>
                  {summary}
                </summary>
                <ul className="flex flex-col gap-1 px-4 pb-3">
                  {
                    <li>
                      <a
                        href={`/admin/browse/classes/${g.key}`}
                        className="text-primary flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {g.name} class profile
                      </a>
                    </li>
                  }
                  {g.classSubjects.map((cs) => {
                    const gaps = [
                      cs.marksMissing > 0 && count(cs.marksMissing, "mark"),
                      cs.commentsMissing > 0 && count(cs.commentsMissing, "comment"),
                    ].filter(Boolean);
                    return (
                      <li key={cs.classSubjectId}>
                        <a
                          href={
                            weightsWrong(cs) && gaps.length === 0
                              ? `/marks/${cs.classSubjectId}/${termId}/assessments`
                              : `/marks/${cs.classSubjectId}/${termId}`
                          }
                          className="hover:bg-muted/40 -mx-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 text-sm"
                        >
                          <span className="text-primary font-medium">
                            {view === "class"
                              ? cs.subjectName
                              : `${cs.className} ${cs.subjectName}`}
                          </span>
                          <span className="text-muted-foreground">
                            {gaps.length
                              ? `${gaps.join(" · ")} missing`
                              : weightsWrong(cs)
                                ? cs.assessments === 0
                                  ? "No assessments yet"
                                  : `Weights ${cs.totalWeight}%`
                                : "Complete"}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                  {g.classes
                    .filter((c) => c.classCommentsMissing !== null)
                    .map((c) => (
                      <li key={c.classId}>
                        <a
                          href={`/marks/classes/${c.classId}/${termId}`}
                          className="hover:bg-muted/40 -mx-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 text-sm"
                        >
                          <span className="text-primary font-medium">
                            {view === "class" ? "Class comments" : `${c.className} class comments`}
                          </span>
                          <span className="text-muted-foreground">
                            {c.classCommentsMissing
                              ? `${count(c.classCommentsMissing, "comment")} missing`
                              : "Complete"}
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Reports by status: the school's totals, then each class opening where its reports are worked on. */
function Reports({ o, rows, termId }: { o: Overseer; rows: ClassReportStatus[]; termId: string }) {
  if (rows.length === 0) return <Empty>No classes this year yet.</Empty>;
  const totals = reportTotals(rows);
  const classHref = (classId: string) =>
    o.isHead ? `/head/reports/${classId}/${termId}` : `/marks/classes/${classId}/${termId}`;
  return (
    <>
      <ul aria-label="Reports by status" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {REPORT_STATUSES.map((s) => (
          <Tile
            key={s}
            id={`reports-${s}`}
            label={REPORT_STATUS_LABELS[s]}
            value={totals[s]}
            href={o.isHead ? `/head?term=${termId}` : `#reports-by-class`}
          />
        ))}
      </ul>
      <ul
        id="reports-by-class"
        aria-label="Reports by class"
        className="bg-card divide-y rounded-2xl border"
      >
        {rows.map((r) => (
          <li key={r.classId}>
            <Link
              href={classHref(r.classId)}
              className="hover:bg-muted/40 flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2"
            >
              <span className="text-primary font-medium">{r.className}</span>
              <span className="text-muted-foreground text-sm" data-testid="class-reports">
                {describeReports(r.counts)}
                {r.returned > 0 && ` (${r.returned} returned)`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
      {children}
    </p>
  );
}
