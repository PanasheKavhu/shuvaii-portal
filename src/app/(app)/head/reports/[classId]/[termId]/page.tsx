import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { TermTabs } from "@/components/marks/class-subject-list";
import { HeadCommentForm, InlineActionButton } from "@/components/reports/head-report-forms";
import { ActionForm } from "@/components/setup/action-form";
import { describeIncomplete } from "@/lib/marks/cell";
import { RETURN_NOTE_MAX, STATUS_LABELS, openGaps } from "@/lib/reports/workflow";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadClassResults, requireClassTerm } from "../../../../marks/comment-data";
import { resolveTerm } from "../../../../marks/data";
import {
  approveReports,
  publishReports,
  returnReports,
  saveHeadComment,
  setResultNotAvailable,
} from "../../../../marks/report-actions";
import { countByStatus, loadClassReports, type ClassReport } from "../../../../marks/report-data";

export const metadata: Metadata = { title: "Class reports" };

/**
 * One class's reports for the head (US-6.2, US-6.3, US-5.4; D44): each
 * learner's report as the class teacher generated it (or, once published,
 * as frozen), the head's comment, the explicit "result not available" line
 * for a subject without a result, and the class's approve, return and
 * publish buttons. Head only (head, deputy or senior master, Q11).
 */
export default async function HeadClassReportsPage({
  params,
}: PageProps<"/head/reports/[classId]/[termId]">) {
  const { classId, termId } = await params;
  const { actor, ct } = await requireClassTerm(classId, termId);
  if (!actor.roles.includes("head")) forbidden();
  const supabase = await createClient();
  const [reports, { learners }, { terms }, school] = await Promise.all([
    loadClassReports(ct.classId, ct.term.id),
    loadClassResults(ct),
    resolveTerm(actor.schoolId, ct.term.id),
    supabase.from("schools").select("timezone").eq("id", actor.schoolId).maybeSingle(),
  ]);
  const counts = countByStatus(reports);
  const reportOf = new Map(reports.map((r) => [r.enrolmentId, r]));
  const noReport = learners.filter((l) => !reportOf.has(l.enrolmentId));
  const ordered = learners
    .map((l) => ({ name: l.name, report: reportOf.get(l.enrolmentId) }))
    .filter((l): l is { name: string; report: ClassReport } => !!l.report);
  const blocked = reports.filter((r) => r.status === "submitted" && openGaps(r.content).length > 0);
  const signed = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: school.data?.timezone ?? "Africa/Harare",
  });
  const n = (count: number) => `${count} ${count === 1 ? "report" : "reports"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={`/head?term=${ct.term.id}`}
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Head&apos;s office
        </Link>
        <div>
          <p className="text-muted-foreground text-sm">{ct.term.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{ct.className}: reports</h1>
          <p aria-label="Where the reports stand" className="text-muted-foreground mt-1">
            {(["submitted", "approved", "published", "draft"] as const)
              .filter((s) => counts[s] > 0)
              .map((s) =>
                s === "draft"
                  ? `${counts[s]} with the class teacher`
                  : `${counts[s]} ${STATUS_LABELS[s].toLowerCase()}`,
              )
              .join(", ") || "The class teacher has not made any reports yet."}
          </p>
        </div>
        <TermTabs
          terms={terms}
          current={ct.term.id}
          hrefFor={(id) => `/head/reports/${ct.classId}/${id}`}
        />
      </div>

      {(counts.submitted > 0 || counts.approved > 0) && (
        <section
          aria-labelledby="class-decision"
          className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs"
        >
          <h2 id="class-decision" className="text-lg font-semibold">
            Decide for the class
          </h2>
          {blocked.length > 0 && (
            <p
              role="note"
              className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
            >
              {blocked.length === 1 ? "1 report has" : `${blocked.length} reports have`} a subject
              without a result. Mark it &ldquo;result not available&rdquo; below, or return the
              reports to the class teacher.
            </p>
          )}
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            {counts.submitted > 0 && (
              <ActionForm
                action={approveReports.bind(null, ct.classId, ct.term.id)}
                submitLabel={`Approve ${n(counts.submitted)}`}
                pendingLabel="Approving…"
                label="Approve reports"
                className="md:flex-1"
              />
            )}
            {counts.approved > 0 && (
              <ActionForm
                action={publishReports.bind(null, ct.classId, ct.term.id)}
                submitLabel={`Publish ${n(counts.approved)}`}
                pendingLabel="Publishing…"
                label="Publish reports"
                className="md:flex-1"
              >
                <p className="text-muted-foreground text-sm">
                  Learners and parents see a report once it is published, and it can no longer
                  change.
                </p>
              </ActionForm>
            )}
            {counts.submitted > 0 && (
              <ActionForm
                action={returnReports.bind(null, ct.classId, ct.term.id)}
                submitLabel="Return to the class teacher"
                pendingLabel="Returning…"
                submitVariant="outline"
                label="Return reports"
                labels={{ note: "Note to the class teacher" }}
                className="md:flex-1"
              >
                <div className="flex flex-col gap-2">
                  <label htmlFor="return-note" className="text-sm font-medium">
                    Note to the class teacher
                  </label>
                  <textarea
                    id="return-note"
                    name="note"
                    rows={3}
                    maxLength={RETURN_NOTE_MAX}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-3"
                  />
                </div>
              </ActionForm>
            )}
          </div>
        </section>
      )}

      {noReport.length > 0 && (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
          No report yet for {noReport.map((l) => l.name).join(", ")}.
        </p>
      )}

      <ul aria-label="Reports" className="flex flex-col gap-4">
        {ordered.map(({ name, report: r }) => {
          const c = r.content;
          const canComment =
            r.hasHeadComment && (r.status === "submitted" || r.status === "approved");
          return (
            <li key={r.id}>
              <article
                aria-label={name}
                className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{name}</h2>
                    <p className="text-muted-foreground text-xs">
                      {c.learnerNumber}
                      {r.referenceCode && ` · Reference ${r.referenceCode}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      r.status === "published"
                        ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                        : r.status === "submitted"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                    )}
                  >
                    {r.status === "draft" ? "With the class teacher" : STATUS_LABELS[r.status]}
                  </span>
                </div>

                <table aria-label={`Report for ${name}`} className="w-full text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Subject and comment</th>
                      <th scope="col">Mark</th>
                      <th scope="col">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.subjects.map((s) => (
                      <tr key={s.classSubjectId} className="border-b align-top last:border-0">
                        <th scope="row" className="py-2 pr-2 text-left font-normal">
                          <span className="font-medium">{s.subject}</span>
                          {s.comment && <span className="block">{s.comment}</span>}
                          {s.teacher && (
                            <span className="text-muted-foreground block text-xs">
                              {s.teacher}
                              {s.signedAt && ` · signed ${signed.format(new Date(s.signedAt))}`}
                            </span>
                          )}
                          {!s.complete && r.status === "submitted" && (
                            <span className="mt-2 block">
                              <InlineActionButton
                                action={setResultNotAvailable.bind(
                                  null,
                                  r.id,
                                  s.classSubjectId,
                                  !s.notAvailable,
                                  ct.classId,
                                  ct.term.id,
                                )}
                                label={
                                  s.notAvailable
                                    ? "Undo “result not available”"
                                    : "Mark “result not available”"
                                }
                                pendingLabel="Saving…"
                                accessibleLabel={
                                  s.notAvailable
                                    ? `Undo result not available for ${s.subject}, ${name}`
                                    : `Mark ${s.subject} result not available for ${name}`
                                }
                              />
                            </span>
                          )}
                        </th>
                        {s.complete ? (
                          <>
                            <td className="py-2 text-right tabular-nums">{s.mark}</td>
                            <td className="text-primary w-10 py-2 text-right font-semibold">
                              {s.grade}
                            </td>
                          </>
                        ) : (
                          <td
                            colSpan={2}
                            className="py-2 text-right text-xs font-medium text-amber-800 dark:text-amber-300"
                          >
                            {s.notAvailable ? "Result not available" : describeIncomplete(s.reason)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(c.average != null || c.position != null) && (
                  <p className="text-sm font-medium tabular-nums">
                    {c.average != null && `Average ${c.average}`}
                    {c.position != null && ` · Position ${c.position} of ${c.classSize}`}
                  </p>
                )}
                {c.classComment && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs font-medium">
                      Class teacher&apos;s comment
                    </p>
                    <p>{c.classComment}</p>
                  </div>
                )}
                {canComment ? (
                  <HeadCommentForm
                    action={saveHeadComment.bind(null, r.id, ct.classId, ct.term.id)}
                    learnerName={name}
                    initial={r.headComment}
                  />
                ) : (
                  (r.status === "published" ? c.headComment : r.headComment) && (
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs font-medium">
                        Head&apos;s comment
                      </p>
                      <p>{r.status === "published" ? c.headComment : r.headComment}</p>
                    </div>
                  )
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
