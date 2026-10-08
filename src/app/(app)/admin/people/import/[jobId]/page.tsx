import type { Metadata } from "next";
import Link from "next/link";
import { IMPORT_KIND_LABEL, ImportStatus } from "@/components/people/import-status";
import { ActionForm } from "@/components/setup/action-form";
import { buttonVariants } from "@/components/ui/button";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/people/fields";
import type { LearnerImportSummary } from "@/lib/people/learner-import";
import type { StaffImportSummary } from "@/lib/people/staff-import";
import { commitImport } from "../../actions";
import { getImportJob, requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Import check" };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function LearnerSummary({ summary }: { summary: LearnerImportSummary }) {
  return (
    <ul aria-label="What will be imported" className="flex list-disc flex-col gap-1 pl-5">
      <li>{plural(summary.learners, "learner")}</li>
      {summary.byClass.map((c) => (
        <li key={c.className} className="ml-4 list-[circle]">
          {c.className}: {c.count}
        </li>
      ))}
      <li>{plural(summary.newGuardians, "new guardian")}</li>
      {summary.existingGuardians > 0 && (
        <li>{plural(summary.existingGuardians, "guardian")} already at the school, linked</li>
      )}
      {summary.sharedGuardians > 0 && (
        <li>{plural(summary.sharedGuardians, "guardian")} linked to more than one child</li>
      )}
    </ul>
  );
}

function StaffSummary({ summary }: { summary: StaffImportSummary }) {
  return (
    <ul aria-label="What will be imported" className="flex list-disc flex-col gap-1 pl-5">
      <li>{plural(summary.staff, "staff role")}</li>
      {summary.byRole.map((r) => (
        <li key={r.role} className="ml-4 list-[circle]">
          {STAFF_ROLE_LABELS[r.role as StaffRole]}: {r.count}
        </li>
      ))}
    </ul>
  );
}

/**
 * US-3.1 and US-3.2, step 2: the check's result. A file with errors lists
 * them by row and imports nothing; a clean file shows what will be added
 * and imports it all at once on "Import".
 */
export default async function ImportJobPage({ params }: PageProps<"/admin/people/import/[jobId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { jobId } = await params;
  const job = await getImportJob(schoolId, jobId);
  const report = job.report;
  const errors = report.errors ?? [];
  const errorCount =
    (report.summary as { errorCount?: number } | undefined)?.errorCount ?? errors.length;
  const listHref = job.kind === "staff" ? "/admin/people/staff" : "/admin/people/learners";

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/people/import"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Import
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold break-all">
          {IMPORT_KIND_LABEL[job.kind]}: {report.fileName ?? "file"}
        </h2>
        <ImportStatus status={job.status} />
      </div>

      {job.status === "failed" && (
        <section aria-labelledby="problems" className="flex flex-col gap-3">
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 font-medium"
          >
            Nothing was imported. Fix{" "}
            {errorCount === 1 ? "this problem" : `these ${errorCount} problems`} in the file and
            upload it again.
          </p>
          <h3 id="problems" className="font-semibold">
            Problems by row
          </h3>
          <ol aria-label="Import errors" className="bg-card divide-y rounded-2xl border">
            {errors.map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <span className="text-muted-foreground w-16 shrink-0 text-sm">
                  {e.row > 0 ? `Row ${e.row}` : "File"}
                </span>
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
          {errorCount > errors.length && (
            <p className="text-muted-foreground text-sm">
              The first {errors.length} problems are shown.
            </p>
          )}
          <Link
            href="/admin/people/import"
            className={buttonVariants({ className: "h-12 w-full text-base sm:w-fit" })}
          >
            Upload a corrected file
          </Link>
        </section>
      )}

      {job.status === "validated" && (
        <section
          aria-labelledby="ready"
          className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
        >
          <h3 id="ready" className="font-semibold">
            The file is clean. This will be imported:
          </h3>
          {job.kind === "staff" ? (
            <StaffSummary summary={report.summary as StaffImportSummary} />
          ) : (
            <LearnerSummary summary={report.summary as LearnerImportSummary} />
          )}
          {job.kind === "staff" && (
            <p className="text-muted-foreground text-sm">
              New staff get an email invite to set their password.
            </p>
          )}
          <ActionForm
            action={commitImport.bind(null, job.id)}
            submitLabel="Import now"
            pendingLabel="Importing…"
            label="Commit import"
          />
        </section>
      )}

      {job.status === "committed" && (
        <section
          aria-labelledby="done"
          className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
        >
          <h3 id="done" className="font-semibold">
            Imported
          </h3>
          {job.kind === "staff" ? (
            <StaffSummary summary={report.summary as StaffImportSummary} />
          ) : (
            <LearnerSummary summary={report.summary as LearnerImportSummary} />
          )}
          {report.notInvited && report.notInvited.length > 0 && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              Invite emails could not be sent to {report.notInvited.join(", ")}. Open each one in
              Staff and use Resend invite.
            </p>
          )}
          <Link
            href={listHref}
            className={buttonVariants({ className: "h-12 text-base sm:w-fit" })}
          >
            {job.kind === "staff" ? "See staff" : "See learners"}
          </Link>
        </section>
      )}
    </div>
  );
}
