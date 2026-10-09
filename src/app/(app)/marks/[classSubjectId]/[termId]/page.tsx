import type { Metadata } from "next";
import Link from "next/link";
import { ClassSubjectHeader } from "@/components/marks/class-subject-header";
import { LockNotice } from "@/components/marks/lock-notice";
import { MarksGrid } from "@/components/marks/marks-grid";
import { SUBJECT_COMMENT_LABEL, SUBJECT_COMMENT_MAX } from "@/lib/comments/rules";
import { weightMessage, weightTotal } from "@/lib/marks/assessments";
import { relockMarks, unlockMarks } from "../../actions";
import { listBank, loadSubjectComments, mayWriteSubjectComments } from "../../comment-data";
import { getLockState, listUnlockers, loadClassSubjectPage, loadGrid } from "../../data";

export const metadata: Metadata = { title: "Marks" };

/**
 * US-4.2, US-4.4, US-4.5: the marks grid of one class subject for a term.
 * Its teacher, the school admin and the head may open it (D32); anyone
 * else gets 403. Read-only for the teacher while the marks are locked.
 * US-5.1, US-5.2: the subject comment column beside it, written by the
 * teacher or the school admin (the head reads it), under the same lock.
 */
export default async function MarksGridPage({
  params,
}: PageProps<"/marks/[classSubjectId]/[termId]">) {
  const { classSubjectId, termId } = await params;
  const { actor, cst } = await loadClassSubjectPage(classSubjectId, termId);
  const [grid, lock, comments, bank] = await Promise.all([
    loadGrid(cst),
    getLockState(cst.classSubjectId, cst.term.id),
    loadSubjectComments(cst.classSubjectId, cst.term.id),
    listBank(actor),
  ]);
  const commentsWritable =
    mayWriteSubjectComments(actor, cst.teacherId) &&
    (actor.roles.includes("school_admin") || !lock.teachersLocked);
  const readOnly = lock.teachersLocked && !actor.isAdminOrHead;
  const unlockers = readOnly ? await listUnlockers(actor.schoolId) : [];
  const assessmentsHref = `/marks/${cst.classSubjectId}/${cst.term.id}/assessments`;
  const weights = weightMessage(
    weightTotal(grid.assessments.map((a) => a.weightPercent)),
    grid.assessments.length,
  );

  return (
    <div className="flex flex-col gap-6">
      <ClassSubjectHeader
        classSubjectId={cst.classSubjectId}
        termId={cst.term.id}
        subjectName={cst.subjectName}
        className={cst.className}
        termName={cst.term.name}
        teacherName={cst.teacherName}
        backHref={
          actor.isAdminOrHead ? `/marks?term=${cst.term.id}` : `/teaching?term=${cst.term.id}`
        }
        backLabel={actor.isAdminOrHead ? "All marks" : "My classes"}
        current="marks"
      />
      <LockNotice
        lock={lock}
        isAdminOrHead={actor.isAdminOrHead}
        subject={`${cst.subjectName} for ${cst.className}`}
        unlockers={unlockers}
        unlockAction={unlockMarks.bind(null, cst.classSubjectId, cst.term.id)}
        relockAction={relockMarks.bind(null, cst.classSubjectId, cst.term.id)}
      />

      {grid.assessments.length === 0 ? (
        <section className="bg-muted/40 flex flex-col items-start gap-3 rounded-2xl border border-dashed p-6">
          <p>No assessments for {cst.term.name} yet.</p>
          {!readOnly && (
            <Link
              href={assessmentsHref}
              className="bg-primary text-primary-foreground flex h-12 items-center rounded-lg px-4 font-medium"
            >
              Set up assessments
            </Link>
          )}
        </section>
      ) : (
        <>
          {!weights.ok && (
            <p
              role="alert"
              className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-900 dark:text-amber-200"
            >
              {weights.text}{" "}
              <Link href={assessmentsHref} className="underline">
                Fix the weights
              </Link>
            </p>
          )}
          <MarksGrid
            assessments={grid.assessments.map((a) => ({
              id: a.id,
              name: a.name,
              maxMark: a.maxMark,
              weightPercent: a.weightPercent,
              writable: actor.isAdminOrHead || !a.isLocked || lock.unlock !== null,
            }))}
            learners={grid.learners}
            marks={grid.marks}
            bands={grid.bands}
            saved={grid.saved}
            readOnly={readOnly}
            comments={{
              label: SUBJECT_COMMENT_LABEL,
              max: SUBJECT_COMMENT_MAX,
              readOnly: !commentsWritable,
              saved: comments,
              bank,
              subjectId: cst.subjectId,
              classSubjectId: cst.classSubjectId,
              termId: cst.term.id,
            }}
          />
        </>
      )}
    </div>
  );
}
