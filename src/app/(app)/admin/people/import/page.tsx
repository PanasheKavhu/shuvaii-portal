import type { Metadata } from "next";
import Link from "next/link";
import { IMPORT_KIND_LABEL, ImportStatus } from "@/components/people/import-status";
import { ActionForm } from "@/components/setup/action-form";
import { LEARNER_COLUMNS } from "@/lib/people/learner-import";
import { STAFF_COLUMNS } from "@/lib/people/staff-import";
import { uploadImport } from "../actions";
import { currentYear, listImportJobs, requireSchoolAdmin } from "../data";

export const metadata: Metadata = { title: "Import" };

const fileClass =
  "border-input file:bg-muted file:text-foreground focus-visible:ring-ring/50 w-full rounded-lg border p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:px-3 file:font-medium focus-visible:ring-3";

function Columns({ columns }: { columns: readonly { label: string; required: boolean }[] }) {
  return (
    <p className="text-muted-foreground text-sm break-words">
      Columns:{" "}
      {columns.map((c, i) => (
        <span key={c.label}>
          {i > 0 && ", "}
          <code className="text-foreground">{c.label}</code>
          {!c.required && " (optional)"}
        </span>
      ))}
      .
    </p>
  );
}

/**
 * US-3.1 and US-3.2, step 1: upload a CSV or Excel file of staff or of
 * learners with guardians. The file is checked first; nothing is imported
 * until the admin commits a clean check.
 */
export default async function ImportPage() {
  const { schoolId } = await requireSchoolAdmin();
  const [jobs, year] = await Promise.all([listImportJobs(schoolId), currentYear(schoolId)]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Upload a CSV or Excel (.xlsx) file. It is checked first and you see every problem by row;
        nothing is imported until the whole file is clean, and then it is imported all at once.
      </p>

      <section
        aria-labelledby="import-learners"
        className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      >
        <h2 id="import-learners" className="text-lg font-semibold">
          Learners and guardians
        </h2>
        <p className="text-sm">
          One row per learner, in {year ? `a ${year.label} class` : "this year's classes"}. Brothers
          and sisters with the same guardian phone or email share one guardian, and a guardian
          already at the school is linked rather than added twice. Primary learners take all their
          class subjects.
        </p>
        <Columns columns={LEARNER_COLUMNS} />
        <a
          href="/templates/learners-import-template.csv"
          download
          className="text-primary w-fit font-medium underline"
        >
          Download the learners template (CSV)
        </a>
        <ActionForm
          action={uploadImport.bind(null, "learners")}
          submitLabel="Upload and check learners"
          pendingLabel="Checking…"
          label="Import learners"
          labels={{ file: "File" }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="learners-file" className="text-sm font-medium">
              Learners file
            </label>
            <input
              id="learners-file"
              name="file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={fileClass}
            />
          </div>
        </ActionForm>
      </section>

      <section
        aria-labelledby="import-staff"
        className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      >
        <h2 id="import-staff" className="text-lg font-semibold">
          Staff
        </h2>
        <p className="text-sm">
          One row per role. Roles: teacher, hod (head of department), head, school_admin. New staff
          get an email invite to set their password.
        </p>
        <Columns columns={STAFF_COLUMNS} />
        <a
          href="/templates/staff-import-template.csv"
          download
          className="text-primary w-fit font-medium underline"
        >
          Download the staff template (CSV)
        </a>
        <ActionForm
          action={uploadImport.bind(null, "staff")}
          submitLabel="Upload and check staff"
          pendingLabel="Checking…"
          label="Import staff"
          labels={{ file: "File" }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="staff-file" className="text-sm font-medium">
              Staff file
            </label>
            <input
              id="staff-file"
              name="file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={fileClass}
            />
          </div>
        </ActionForm>
      </section>

      {jobs.length > 0 && (
        <section aria-labelledby="recent" className="flex flex-col gap-3">
          <h2 id="recent" className="text-lg font-semibold">
            Recent imports
          </h2>
          <ul aria-label="Recent imports" className="bg-card divide-y rounded-2xl border">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/admin/people/import/${job.id}`}
                  className="hover:bg-muted/60 flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium break-all">
                      {IMPORT_KIND_LABEL[job.kind]}: {job.report.fileName ?? "file"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {new Date(job.createdAt).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Africa/Harare",
                      })}
                    </span>
                  </span>
                  <ImportStatus status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
