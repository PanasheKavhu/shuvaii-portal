import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField } from "@/components/setup/fields";
import { generateDrafts, submitReports } from "@/app/(app)/marks/report-actions";
import { countByStatus, latestReturnNote, type ClassReport } from "@/app/(app)/marks/report-data";
import { STATUS_LABELS, describeGap, onlyResultGaps, type ReportGap } from "@/lib/reports/workflow";

/**
 * The reports part of the class teacher's class screen (US-6.1, US-6.2;
 * D44): where the class's reports stand, the head's note on returned
 * reports, the learners still missing something (exactly what), and the
 * generate and submit buttons. The head and school admin see where the
 * reports stand, and the head a link to approve them.
 */
export function ClassReportPanel({
  classId,
  termId,
  learners,
  reports,
  gaps,
  isClassTeacher,
  isHead,
}: {
  classId: string;
  termId: string;
  learners: readonly { enrolmentId: string; name: string }[];
  reports: readonly ClassReport[];
  gaps: ReadonlyMap<string, ReportGap[]>;
  isClassTeacher: boolean;
  isHead: boolean;
}) {
  const counts = countByStatus(reports);
  const reportOf = new Map(reports.map((r) => [r.enrolmentId, r]));
  const note = latestReturnNote(reports);
  // Learners whose report is not yet with the head and who still lack something.
  const missing = learners
    .filter((l) => (reportOf.get(l.enrolmentId)?.status ?? "draft") === "draft")
    .map((l) => ({ ...l, gaps: gaps.get(l.enrolmentId) ?? [] }))
    .filter((l) => l.gaps.length > 0);
  const canChooseIncomplete = missing.some((l) => onlyResultGaps(l.gaps));
  const noReport = learners.filter((l) => !reportOf.has(l.enrolmentId)).length;
  const summary = (["draft", "submitted", "approved", "published"] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${STATUS_LABELS[s].toLowerCase()}`);
  if (noReport > 0) summary.push(`${noReport} with no report yet`);

  return (
    <section
      aria-labelledby="reports-heading"
      className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs"
    >
      <div>
        <h2 id="reports-heading" className="text-lg font-semibold">
          Reports
        </h2>
        <p aria-label="Where the reports stand" className="text-muted-foreground text-sm">
          {summary.length ? summary.join(", ") : "No learners in this class yet."}
        </p>
      </div>

      {note && (
        <div
          role="note"
          aria-label="Note from the head"
          className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <p className="font-semibold">Returned by the head</p>
          <p className="mt-1 whitespace-pre-line">{note}</p>
        </div>
      )}

      {missing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Not ready for a report</h3>
          <ul aria-label="Learners missing something" className="flex flex-col gap-2">
            {missing.map((l) => (
              <li key={l.enrolmentId} className="bg-muted/40 rounded-xl px-3 py-2 text-sm">
                <p className="font-medium">{l.name}</p>
                <ul
                  aria-label={`Missing for ${l.name}`}
                  className="text-muted-foreground mt-1 list-disc pl-5"
                >
                  {l.gaps.map((g, i) => (
                    <li key={i}>{describeGap(g)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isClassTeacher && (
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <ActionForm
            action={generateDrafts.bind(null, classId, termId)}
            submitLabel="Generate draft reports"
            pendingLabel="Generating…"
            submitVariant={counts.draft > 0 ? "outline" : "default"}
            label="Generate draft reports"
            className="md:flex-1"
          >
            <p className="text-muted-foreground text-sm">
              Makes a draft for every learner with nothing missing, and refreshes drafts already
              made.
            </p>
            {canChooseIncomplete && (
              <CheckboxField
                id="include-incomplete"
                name="includeIncomplete"
                label="Also make drafts for learners whose only gap is a subject result (the head decides)"
              />
            )}
          </ActionForm>
          {counts.draft > 0 && (
            <ActionForm
              action={submitReports.bind(null, classId, termId)}
              submitLabel={`Submit ${counts.draft} ${counts.draft === 1 ? "report" : "reports"} to the head`}
              pendingLabel="Submitting…"
              label="Submit reports"
              className="md:flex-1"
            >
              <p className="text-muted-foreground text-sm">
                The head checks them, then approves or returns them to you with a note.
              </p>
            </ActionForm>
          )}
        </div>
      )}

      {isHead && reports.length > 0 && (
        <Link
          href={`/head/reports/${classId}/${termId}`}
          className="text-primary w-fit text-sm font-medium hover:underline"
        >
          Check and approve these reports
        </Link>
      )}
    </section>
  );
}
