import type { Metadata } from "next";
import Link from "next/link";
import { TermTabs } from "@/components/marks/class-subject-list";
import { BackToOverview, Muted, ProfileSection } from "@/components/oversight/profile-bits";
import { StatusPill } from "@/components/people/status-pill";
import { count, overallTotals } from "@/lib/marks/completion";
import { REPORT_STATUSES, REPORT_STATUS_LABELS, totalReports } from "@/lib/oversight/summary";
import { requireOverseer } from "../../../oversight-data";
import { loadClassProfile } from "../../data";

export const metadata: Metadata = { title: "Class" };

/**
 * US-9.2: one class, read-only. Its teachers, its learners with each
 * subject's grade, average and position for the term (subject_results()
 * and class_positions(), D31), what is still missing (D36) and its reports
 * by status. A hod opens only a class they teach in (D23).
 */
export default async function ClassProfilePage({
  params,
  searchParams,
}: PageProps<"/admin/browse/classes/[classId]">) {
  const o = await requireOverseer();
  const { classId } = await params;
  const { term: wanted } = await searchParams;
  const c = await loadClassProfile(o, classId, typeof wanted === "string" ? wanted : undefined);
  const owed = overallTotals(c.owed.classSubjects, c.owed.classes);
  const current = c.learners.filter((l) => l.stillInClass);
  const shownSubjects = c.teachers.filter((t) =>
    current.some((l) => l.grades[t.classSubjectId] !== undefined),
  );
  const hasPositions = current.some((l) => l.position !== null);
  const reportHref = c.term
    ? o.isHead
      ? `/head/reports/${c.id}/${c.term.id}`
      : `/marks/classes/${c.id}/${c.term.id}`
    : null;

  return (
    <div className="flex flex-col gap-5">
      <BackToOverview />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p className="text-muted-foreground mt-1">
          {[c.levelName, c.yearLabel, `${count(current.length, "learner")}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {c.term && (
        <TermTabs
          terms={c.terms}
          current={c.term.id}
          hrefFor={(id) => `/admin/browse/classes/${c.id}?term=${id}`}
        />
      )}

      <ProfileSection id="teachers" title="Teachers">
        <p className="mb-2 text-sm">
          <span className="font-medium">Class teacher: </span>
          {c.classTeacher ? (
            <Link
              href={`/admin/browse/staff/${c.classTeacher.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {c.classTeacher.name}
            </Link>
          ) : (
            "None yet"
          )}
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {c.teachers.map((t) => (
            <li key={t.classSubjectId} className="text-sm">
              <span className="font-medium">{t.subjectName}</span>
              {" · "}
              {t.teacherId && t.teacherName ? (
                <Link
                  href={`/admin/browse/staff/${t.teacherId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t.teacherName}
                </Link>
              ) : (
                <span className="text-muted-foreground">No teacher yet</span>
              )}
            </li>
          ))}
        </ul>
      </ProfileSection>

      {c.term && (
        <ProfileSection id="missing" title={`Still missing in ${c.term.name}`}>
          <p>
            {count(owed.marksMissing, "mark")}, {count(owed.commentsMissing, "subject comment")}
            {c.term.kind !== "vacation" && `, ${count(owed.classCommentsMissing, "class comment")}`}
            .
          </p>
          <ul className="mt-2 flex flex-col">
            {c.owed.classSubjects.map((cs) => (
              <li key={cs.classSubjectId}>
                <Link
                  href={`/marks/${cs.classSubjectId}/${c.term!.id}`}
                  className="hover:bg-muted/40 -mx-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 text-sm"
                >
                  <span className="text-primary font-medium">{cs.subjectName}</span>
                  <span className="text-muted-foreground">
                    {cs.marksMissing || cs.commentsMissing
                      ? `${[
                          cs.marksMissing > 0 && count(cs.marksMissing, "mark"),
                          cs.commentsMissing > 0 && count(cs.commentsMissing, "comment"),
                        ]
                          .filter(Boolean)
                          .join(" · ")} missing`
                      : "Complete"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ProfileSection>
      )}

      {c.term && (
        <ProfileSection id="results" title={`Results for ${c.term.name}`}>
          {current.length === 0 ? (
            <Muted>No learners you can see in this class.</Muted>
          ) : shownSubjects.length === 0 && !hasPositions ? (
            <Muted>No results for this term yet.</Muted>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-max text-sm">
                <caption className="sr-only">Results for {c.term.name}</caption>
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Learner
                    </th>
                    {shownSubjects.map((s) => (
                      <th key={s.classSubjectId} scope="col" className="px-2 py-2 font-medium">
                        {s.subjectName}
                      </th>
                    ))}
                    {hasPositions && (
                      <>
                        <th scope="col" className="px-2 py-2 font-medium">
                          Average
                        </th>
                        <th scope="col" className="px-2 py-2 font-medium">
                          Position
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {current.map((l) => (
                    <tr key={l.id}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <Link
                          href={`/admin/browse/learners/${l.id}`}
                          className="text-primary font-medium underline-offset-4 hover:underline"
                        >
                          {l.name}
                        </Link>
                        <span className="text-muted-foreground block text-xs">{l.number}</span>
                      </th>
                      {shownSubjects.map((s) => (
                        <td key={s.classSubjectId} className="px-2 py-2 tabular-nums">
                          {l.grades[s.classSubjectId] ?? "–"}
                        </td>
                      ))}
                      {hasPositions && (
                        <>
                          <td className="px-2 py-2 tabular-nums">
                            {l.average === null ? "–" : `${l.average.toFixed(1)}%`}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{l.position ?? "–"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            A dash means the result is not complete yet.
          </p>
        </ProfileSection>
      )}

      {c.term && (
        <ProfileSection id="reports" title="Reports">
          {totalReports(c.reports) === 0 ? (
            <Muted>No reports for this term yet.</Muted>
          ) : (
            <ul aria-label="Reports by status" className="flex flex-wrap gap-2">
              {REPORT_STATUSES.filter((s) => c.reports[s] > 0).map((s) => (
                <li key={s}>
                  <StatusPill
                    tone={s === "published" ? "good" : s === "withdrawn" ? "muted" : "warn"}
                  >
                    {c.reports[s]} {REPORT_STATUS_LABELS[s].toLowerCase()}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
          {reportHref && o.isAdminOrHead && (
            <Link
              href={reportHref}
              className="text-primary mt-2 flex min-h-11 w-fit items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {o.isHead ? "Check and publish this class's reports" : "Open the class's reports"}
            </Link>
          )}
        </ProfileSection>
      )}

      {c.learners.some((l) => !l.stillInClass) && (
        <ProfileSection id="left" title="No longer in the class">
          <ul className="flex flex-col gap-1 text-sm">
            {c.learners
              .filter((l) => !l.stillInClass)
              .map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/admin/browse/learners/${l.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {l.name}
                  </Link>
                  <span className="text-muted-foreground"> · {l.number}</span>
                </li>
              ))}
          </ul>
        </ProfileSection>
      )}
    </div>
  );
}
