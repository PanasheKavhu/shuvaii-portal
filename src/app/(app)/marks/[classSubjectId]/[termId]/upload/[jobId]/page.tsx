import type { Metadata } from "next";
import Link from "next/link";
import { ClassSubjectHeader } from "@/components/marks/class-subject-header";
import { MarksUploadStatus } from "@/components/marks/upload-status";
import { ActionForm } from "@/components/setup/action-form";
import { buttonVariants } from "@/components/ui/button";
import type { MarksUploadSummary } from "@/lib/marks/upload";
import { commitMarksUpload } from "../../../../actions";
import { getLockState, getMarksUpload, loadClassSubjectPage } from "../../../../data";

export const metadata: Metadata = { title: "Marks upload check" };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Summary({ summary }: { summary: MarksUploadSummary }) {
  return (
    <ul aria-label="What will be saved" className="flex list-disc flex-col gap-1 pl-5">
      <li>{plural(summary.learners, "learner")} in the file</li>
      <li>{plural(summary.newMarks, "new mark")}</li>
      <li>{plural(summary.changedMarks, "changed mark")}</li>
      {summary.unchanged > 0 && (
        <li>{plural(summary.unchanged, "mark")} already saved, unchanged</li>
      )}
    </ul>
  );
}

/**
 * US-4.3, step 2: the check's result. A file with problems lists them by
 * row and saves nothing; a clean file shows what will change and saves it
 * all at once (D33).
 */
export default async function MarksUploadJobPage({
  params,
}: PageProps<"/marks/[classSubjectId]/[termId]/upload/[jobId]">) {
  const { classSubjectId, termId, jobId } = await params;
  const { actor, cst } = await loadClassSubjectPage(classSubjectId, termId);
  const [job, lock] = await Promise.all([
    getMarksUpload(cst, jobId),
    getLockState(cst.classSubjectId, cst.term.id),
  ]);
  const readOnly = lock.teachersLocked && !actor.isAdminOrHead;
  const base = `/marks/${cst.classSubjectId}/${cst.term.id}`;
  const changes = job.summary ? job.summary.newMarks + job.summary.changedMarks : 0;

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
        current="upload"
      />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold break-all">{job.fileName ?? "Marks file"}</h2>
        <MarksUploadStatus status={job.status} />
      </div>

      {job.status === "failed" && (
        <section aria-labelledby="problems" className="flex flex-col gap-3">
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 font-medium"
          >
            Nothing was saved. Fix{" "}
            {job.errorCount === 1 ? "this problem" : `these ${job.errorCount} problems`} in the file
            and upload it again.
          </p>
          <h3 id="problems" className="font-semibold">
            Problems by row
          </h3>
          <ol aria-label="Upload problems" className="bg-card divide-y rounded-2xl border">
            {job.errors.map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <span className="text-muted-foreground w-16 shrink-0 text-sm">
                  {e.row > 0 ? `Row ${e.row}` : "File"}
                </span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
          </ol>
          {job.errorCount > job.errors.length && (
            <p className="text-muted-foreground text-sm">
              The first {job.errors.length} problems are shown.
            </p>
          )}
          <Link
            href={`${base}/upload`}
            className={buttonVariants({ className: "h-12 w-full text-base sm:w-fit" })}
          >
            Upload a corrected file
          </Link>
        </section>
      )}

      {job.status === "validated" && job.summary && (
        <section
          aria-labelledby="ready"
          className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
        >
          <h3 id="ready" className="font-semibold">
            The file is clean. This will be saved:
          </h3>
          <Summary summary={job.summary} />
          {readOnly ? (
            <p role="status" className="font-medium">
              These marks are now locked, so the upload cannot be saved.
            </p>
          ) : (
            <ActionForm
              action={commitMarksUpload.bind(null, cst.classSubjectId, cst.term.id, job.id)}
              submitLabel={`Save ${plural(changes, "mark")}`}
              pendingLabel="Saving…"
              label="Save marks"
            />
          )}
        </section>
      )}

      {job.status === "committed" && (
        <section
          aria-labelledby="done"
          className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
        >
          <h3 id="done" className="font-semibold">
            Saved
          </h3>
          {job.summary && <Summary summary={job.summary} />}
          <Link href={base} className={buttonVariants({ className: "h-12 text-base sm:w-fit" })}>
            See the marks
          </Link>
        </section>
      )}
    </div>
  );
}
