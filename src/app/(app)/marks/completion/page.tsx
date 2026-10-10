import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TermTabs } from "@/components/marks/class-subject-list";
import {
  byClass,
  byTeacher,
  count,
  isComplete,
  overallTotals,
  weightsWrong,
  type CompletionGroup,
  type CompletionTotals,
} from "@/lib/marks/completion";
import { cn } from "@/lib/utils";
import { loadCompletion } from "../completion-data";
import { requireMarksActor, resolveTerm } from "../data";

export const metadata: Metadata = { title: "Completion" };

/**
 * What is still missing for the term (US-4.8, D36): marks, subject comments
 * and class comments, and class subjects whose weights do not add to 100.
 * School admin and head see the whole school by class or by teacher; a
 * teacher or hod sees their own class subjects and classes. Each line opens
 * the screen where the gap is filled.
 */
export default async function CompletionPage({ searchParams }: PageProps<"/marks/completion">) {
  const actor = await requireMarksActor("completion");
  const { term: wanted, by } = await searchParams;
  const { terms, term } = await resolveTerm(actor.schoolId, wanted);
  const data = term ? await loadCompletion(term.id) : { classSubjects: [], classes: [] };
  const view = actor.isAdminOrHead && by === "teacher" ? "teacher" : "class";
  const groups =
    view === "teacher"
      ? byTeacher(data.classSubjects, data.classes)
      : byClass(data.classSubjects, data.classes);
  const totals = overallTotals(data.classSubjects, data.classes);
  const vacation = term?.kind === "vacation";
  const hrefFor = (termId: string, v = view) =>
    `/marks/completion?term=${termId}${v === "teacher" ? "&by=teacher" : ""}`;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Completion</h1>
        <p className="text-muted-foreground mt-1">
          {actor.isAdminOrHead
            ? "What is still missing before reports, for every class."
            : "What is still missing in your class subjects and classes."}
          {term ? ` ${term.name}.` : ""}
        </p>
      </div>
      {term && <TermTabs terms={terms} current={term.id} hrefFor={(id) => hrefFor(id)} />}

      {!term ? (
        <Empty>Your school has not set up this year&apos;s terms yet.</Empty>
      ) : groups.length === 0 ? (
        <Empty>
          {actor.isAdminOrHead
            ? "No classes this year yet."
            : "You have no class subjects or classes this year."}
        </Empty>
      ) : (
        <>
          <Totals totals={totals} vacation={vacation} />
          {actor.isAdminOrHead && (
            <nav aria-label="Group by" className="flex gap-2">
              {(["class", "teacher"] as const).map((v) => (
                <Link
                  key={v}
                  href={hrefFor(term.id, v)}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                    view === v ? "bg-primary text-primary-foreground border-primary" : "bg-card",
                  )}
                >
                  By {v}
                </Link>
              ))}
            </nav>
          )}
          <ul aria-label={`Completion by ${view}`} className="flex flex-col gap-4">
            {groups.map((g) => (
              <Group key={g.key} group={g} termId={term.id} view={view} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Totals({ totals, vacation }: { totals: CompletionTotals; vacation: boolean }) {
  const tiles = [
    { id: "marks", label: "Marks missing", value: totals.marksMissing },
    { id: "comments", label: "Subject comments missing", value: totals.commentsMissing },
    ...(vacation
      ? []
      : [
          {
            id: "class-comments",
            label: "Class comments missing",
            value: totals.classCommentsMissing,
          },
        ]),
    { id: "weights", label: "Weights not 100", value: totals.weightProblems },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-2xl border p-4",
            t.value === 0 ? "bg-card" : "border-amber-500/40 bg-amber-500/10",
          )}
        >
          <dt className="text-muted-foreground text-sm">{t.label}</dt>
          <dd className="text-2xl font-semibold tabular-nums" data-testid={`total-${t.id}`}>
            {t.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Group({
  group,
  termId,
  view,
}: {
  group: CompletionGroup;
  termId: string;
  view: "class" | "teacher";
}) {
  const done = isComplete(group.totals);
  return (
    <li className="bg-card rounded-2xl border p-4 shadow-xs">
      <section aria-label={group.name}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              done
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-900 dark:text-amber-200",
            )}
          >
            {done ? "Complete" : "Missing items"}
          </span>
        </div>
        <ul className="mt-3 flex flex-col divide-y">
          {group.classSubjects.map((cs) => {
            const name =
              view === "class"
                ? `${cs.subjectName} · ${cs.teacherName ?? "No teacher yet"}`
                : `${cs.className} ${cs.subjectName}`;
            const gaps = [
              cs.marksMissing > 0 && `${count(cs.marksMissing, "mark")} missing`,
              cs.commentsMissing > 0 && `${count(cs.commentsMissing, "comment")} missing`,
            ].filter(Boolean);
            return (
              <li key={cs.classSubjectId} className="flex flex-col gap-1 py-2">
                <Link
                  href={`/marks/${cs.classSubjectId}/${termId}`}
                  className="text-primary flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
                <span className="text-sm" data-testid="class-subject-gaps">
                  {gaps.length > 0 ? gaps.join(" · ") : "Marks and comments complete"}
                </span>
                {weightsWrong(cs) && (
                  <Link
                    href={`/marks/${cs.classSubjectId}/${termId}/assessments`}
                    className="flex min-h-11 w-fit items-center text-sm font-medium text-amber-900 underline underline-offset-4 dark:text-amber-200"
                  >
                    {cs.assessments === 0
                      ? "No assessments yet"
                      : `Weights add up to ${cs.totalWeight}%, not 100%`}
                  </Link>
                )}
              </li>
            );
          })}
          {group.classes
            .filter((c) => c.classCommentsMissing !== null)
            .map((c) => (
              <li key={c.classId} className="flex flex-col gap-1 py-2">
                <Link
                  href={`/marks/classes/${c.classId}/${termId}`}
                  className="text-primary flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                >
                  {view === "class"
                    ? `Class comments · ${c.classTeacherName ?? "No class teacher yet"}`
                    : `${c.className} class comments`}
                </Link>
                <span className="text-sm" data-testid="class-comment-gaps">
                  {c.classCommentsMissing
                    ? `${count(c.classCommentsMissing, "class comment")} missing`
                    : "Class comments complete"}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
      {children}
    </p>
  );
}
