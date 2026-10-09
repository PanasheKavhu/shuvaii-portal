import type { Metadata } from "next";
import Link from "next/link";
import { ClassCommentBox } from "@/components/comments/class-comment-box";
import { TermTabs } from "@/components/marks/class-subject-list";
import { termHasClassComments } from "@/lib/comments/rules";
import { describeIncomplete } from "@/lib/marks/cell";
import { describeLock, describeUnlockers } from "@/lib/marks/terms";
import { listBank, loadClassResults, requireClassTerm } from "../../../comment-data";
import { listUnlockers, resolveTerm } from "../../../data";

export const metadata: Metadata = { title: "Class results and comments" };

/**
 * US-5.3: the class teacher's screen for one class and term. Each learner's
 * subject results and grades, average and position, and a box for the
 * overall comment (term reports only, Q8). The class teacher and the school
 * admin write; the head reads. Teachers are locked out after the marks
 * deadline like marks (D34).
 */
export default async function ClassCommentsPage({
  params,
}: PageProps<"/marks/classes/[classId]/[termId]">) {
  const { classId, termId } = await params;
  const { actor, ct, isClassTeacher } = await requireClassTerm(classId, termId);
  const [{ learners, comments, lock }, bank, { terms }] = await Promise.all([
    loadClassResults(ct),
    listBank(actor),
    resolveTerm(actor.schoolId, ct.term.id),
  ]);
  const isAdmin = actor.roles.includes("school_admin");
  const hasComments = termHasClassComments(ct.term.kind);
  const canWrite = hasComments && (isAdmin || (isClassTeacher && !lock.teachersLocked));
  const unlockers =
    isClassTeacher && !isAdmin && lock.teachersLocked
      ? (await listUnlockers(actor.schoolId)).filter((u) => u.role === "school_admin")
      : [];
  const why = describeLock(lock.reason, lock.marksDeadline);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={actor.isAdminOrHead ? `/marks?term=${ct.term.id}` : `/teaching?term=${ct.term.id}`}
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← {actor.isAdminOrHead ? "All marks" : "My classes"}
        </Link>
        <div>
          <p className="text-muted-foreground text-sm">{ct.term.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {ct.className}: results and comments
          </h1>
          <p className="text-muted-foreground mt-1">
            {hasComments
              ? "Each learner's subject results, average and position, with the class teacher's comment for the report."
              : "Each learner's subject results. Vacation school reports have no class teacher's comment."}
          </p>
        </div>
        <TermTabs
          terms={terms}
          current={ct.term.id}
          hrefFor={(id) => `/marks/classes/${ct.classId}/${id}`}
        />
      </div>

      {hasComments && lock.teachersLocked && (
        <p
          role="note"
          className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          {isAdmin
            ? `Class teachers can no longer change these comments because ${why}. You can still write them.`
            : isClassTeacher
              ? `These comments are read-only because ${why}. Ask ${unlockers.length ? describeUnlockers(unlockers) : "your school admin"} to write any that are missing.`
              : `Class teachers can no longer change these comments because ${why}.`}
        </p>
      )}
      {hasComments && !isAdmin && !isClassTeacher && (
        <p className="text-muted-foreground text-sm">
          The class teacher writes these comments; you can read them.
        </p>
      )}

      {learners.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No learners in this class yet.
        </p>
      ) : (
        <ul aria-label="Learners" className="flex flex-col gap-4">
          {learners.map((l) => (
            <li key={l.enrolmentId}>
              <article
                aria-label={l.name}
                className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs md:flex-row md:gap-6"
              >
                <div className="flex flex-col gap-3 md:w-1/2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{l.name}</h2>
                      <p className="text-muted-foreground text-xs">{l.learnerNumber}</p>
                    </div>
                    <p
                      aria-label={`Average and position for ${l.name}`}
                      className="text-right text-sm"
                    >
                      <span className="block font-semibold tabular-nums">
                        Average {l.average ?? "–"}
                        {l.averageGrade && (
                          <span className="text-primary ml-1">{l.averageGrade}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground block">
                        {l.position
                          ? `Position ${l.position} of ${l.classSize}`
                          : ct.term.kind === "vacation"
                            ? "No positions in vacation school"
                            : "No position"}
                      </span>
                    </p>
                  </div>
                  {l.subjects.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No results yet this term.</p>
                  ) : (
                    <table aria-label={`Results for ${l.name}`} className="w-full text-sm">
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">Subject</th>
                          <th scope="col">Mark</th>
                          <th scope="col">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.subjects.map((s) => (
                          <tr key={s.classSubjectId} className="border-b last:border-0">
                            <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                              {s.subjectName}
                            </th>
                            {s.status === "complete" ? (
                              <>
                                <td className="py-1.5 text-right tabular-nums">{s.mark}</td>
                                <td className="text-primary w-10 py-1.5 text-right font-semibold">
                                  {s.grade}
                                </td>
                              </>
                            ) : (
                              <td
                                colSpan={2}
                                className="py-1.5 text-right text-xs font-medium text-amber-800 dark:text-amber-300"
                              >
                                {describeIncomplete(s.reason)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {hasComments && (
                  <div className="md:w-1/2">
                    <ClassCommentBox
                      classId={ct.classId}
                      termId={ct.term.id}
                      enrolmentId={l.enrolmentId}
                      learnerName={l.name}
                      initial={comments[l.enrolmentId]}
                      readOnly={!canWrite}
                      bank={bank}
                      grade={l.averageGrade}
                    />
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
