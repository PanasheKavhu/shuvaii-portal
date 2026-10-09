import type { Metadata } from "next";
import Link from "next/link";
import { ClassSubjectHeader } from "@/components/marks/class-subject-header";
import { LockNotice } from "@/components/marks/lock-notice";
import { MarksUploadStatus } from "@/components/marks/upload-status";
import { ActionForm } from "@/components/setup/action-form";
import { buttonVariants } from "@/components/ui/button";
import { relockMarks, unlockMarks, uploadMarks } from "../../../actions";
import {
  getLockState,
  listAssessments,
  listMarksUploads,
  listUnlockers,
  loadClassSubjectPage,
} from "../../../data";

export const metadata: Metadata = { title: "Upload marks" };

const fileClass =
  "border-input file:bg-muted file:text-foreground focus-visible:ring-ring/50 w-full rounded-lg border p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:px-3 file:font-medium focus-visible:ring-3";

/**
 * US-4.3, step 1: download the template for this class subject and term,
 * fill it in and upload it. The file is checked first and every problem is
 * listed by row; nothing is saved until the whole file is clean (D33).
 * Closed while the marks are locked for the teacher.
 */
export default async function UploadMarksPage({
  params,
}: PageProps<"/marks/[classSubjectId]/[termId]/upload">) {
  const { classSubjectId, termId } = await params;
  const { actor, cst } = await loadClassSubjectPage(classSubjectId, termId);
  const [assessments, lock, uploads] = await Promise.all([
    listAssessments(cst.classSubjectId, cst.term.id),
    getLockState(cst.classSubjectId, cst.term.id),
    listMarksUploads(cst),
  ]);
  const readOnly = lock.teachersLocked && !actor.isAdminOrHead;
  const unlockers = readOnly ? await listUnlockers(actor.schoolId) : [];
  const base = `/marks/${cst.classSubjectId}/${cst.term.id}`;

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
      <LockNotice
        lock={lock}
        isAdminOrHead={actor.isAdminOrHead}
        subject={`${cst.subjectName} for ${cst.className}`}
        unlockers={unlockers}
        unlockAction={unlockMarks.bind(null, cst.classSubjectId, cst.term.id)}
        relockAction={relockMarks.bind(null, cst.classSubjectId, cst.term.id)}
      />

      {assessments.length === 0 ? (
        <section className="bg-muted/40 flex flex-col items-start gap-3 rounded-2xl border border-dashed p-6">
          <p>Set up this term&apos;s assessments first; the template has a column for each.</p>
          {!readOnly && (
            <Link
              href={`${base}/assessments`}
              className={buttonVariants({ className: "h-12 text-base" })}
            >
              Set up assessments
            </Link>
          )}
        </section>
      ) : readOnly ? (
        <p className="text-muted-foreground">Uploading is closed while these marks are locked.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          <li className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
            <h2 className="text-lg font-semibold">1. Download the template</h2>
            <p className="text-sm">
              One row per learner taking {cst.subjectName}, and a column for each assessment (
              {assessments.map((a) => `${a.name} out of ${a.maxMark}`).join(", ")}), with the marks
              already saved filled in.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`${base}/template`}
                download
                className={buttonVariants({ className: "h-12 text-base" })}
              >
                Download template (Excel)
              </a>
              <a
                href={`${base}/template?format=csv`}
                download
                className={buttonVariants({ variant: "outline", className: "h-12 text-base" })}
              >
                Download as CSV
              </a>
            </div>
          </li>
          <li className="bg-card flex flex-col gap-2 rounded-2xl border p-4">
            <h2 className="text-lg font-semibold">2. Fill it in</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>Type each mark, or A for absent and E for excused.</li>
              <li>A blank cell leaves that mark as it is; saved marks are never removed.</li>
              <li>Keep the learner numbers and the header row as they are.</li>
            </ul>
          </li>
          <li className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
            <h2 className="text-lg font-semibold">3. Upload and check</h2>
            <p className="text-sm">
              You will see every problem by row. Nothing is saved until the whole file is clean.
            </p>
            <ActionForm
              action={uploadMarks.bind(null, cst.classSubjectId, cst.term.id)}
              submitLabel="Upload and check"
              pendingLabel="Checking…"
              label="Upload marks"
              labels={{ file: "File" }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="marks-file" className="text-sm font-medium">
                  Marks file (.xlsx or CSV)
                </label>
                <input
                  id="marks-file"
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className={fileClass}
                />
              </div>
            </ActionForm>
          </li>
        </ol>
      )}

      {uploads.length > 0 && (
        <section aria-labelledby="recent-uploads" className="flex flex-col gap-3">
          <h2 id="recent-uploads" className="text-lg font-semibold">
            Recent uploads
          </h2>
          <ul aria-label="Recent uploads" className="bg-card divide-y rounded-2xl border">
            {uploads.map((job) => (
              <li key={job.id}>
                <Link
                  href={`${base}/upload/${job.id}`}
                  className="hover:bg-muted/60 flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium break-all">{job.fileName ?? "file"}</span>
                    <span className="text-muted-foreground text-sm">
                      {new Date(job.createdAt).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Africa/Harare",
                      })}
                    </span>
                  </span>
                  <MarksUploadStatus status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
