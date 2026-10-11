import "server-only";

import {
  isReportStatus,
  readReportContent,
  type ReportContent,
  type ReportGap,
  type ReportStatus,
} from "@/lib/reports/workflow";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the report workflow screens (US-6.1 to US-6.3; D44), through
 * the user-scoped client: the reports' RLS and public.report_gaps() decide
 * what is visible.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "reports", "Could not load the reports. Please try again.");
}

export type ClassReport = {
  id: string;
  enrolmentId: string;
  status: ReportStatus;
  version: number;
  content: ReportContent;
  headComment: string | null;
  returnNote: string | null;
  returnedAt: string | null;
  referenceCode: string | null;
  /** The stored PDF of a published report, once made (US-6.4). */
  pdfPath: string | null;
  /** Whether the report's template prints a head's comment (not on vacation reports by default). */
  hasHeadComment: boolean;
};

/** The live (not withdrawn) report of each learner of a class for a term. */
export async function loadClassReports(classId: string, termId: string): Promise<ClassReport[]> {
  const supabase = await createClient();
  return rows(
    await supabase
      .from("reports")
      .select(
        "id, enrolment_id, status, version, snapshot, head_comment, return_note, returned_at, reference_code, pdf_path, enrolments!inner(class_id), report_templates!inner(sections)",
      )
      .eq("term_id", termId)
      .eq("enrolments.class_id", classId)
      .neq("status", "withdrawn"),
  ).map((r) => ({
    id: r.id,
    enrolmentId: r.enrolment_id,
    status: isReportStatus(r.status) ? r.status : "draft",
    version: r.version,
    content: readReportContent(r.snapshot),
    headComment: r.head_comment,
    returnNote: r.return_note,
    returnedAt: r.returned_at,
    referenceCode: r.reference_code,
    pdfPath: r.pdf_path,
    hasHeadComment:
      (r.report_templates.sections as Record<string, unknown> | null)?.head_comment === true,
  }));
}

/** What each learner still lacks for a report, keyed by enrolment. */
export async function loadReportGaps(
  classId: string,
  termId: string,
): Promise<Map<string, ReportGap[]>> {
  const supabase = await createClient();
  const byEnrolment = new Map<string, ReportGap[]>();
  for (const g of rows(
    await supabase.rpc("report_gaps", { p_class_id: classId, p_term_id: termId }),
  )) {
    const list = byEnrolment.get(g.enrolment_id) ?? [];
    list.push({
      gap: g.gap,
      subjectName: g.subject_name ?? null,
      reason: g.reason ?? null,
      assessmentNames: g.assessment_names ?? [],
    });
    byEnrolment.set(g.enrolment_id, list);
  }
  return byEnrolment;
}

/** The newest note from the head on a returned draft of the class, if any. */
export function latestReturnNote(reports: readonly ClassReport[]): string | null {
  const returned = reports
    .filter((r) => r.status === "draft" && r.returnNote && r.returnedAt)
    .sort((a, b) => b.returnedAt!.localeCompare(a.returnedAt!));
  return returned[0]?.returnNote ?? null;
}

export function countByStatus(reports: readonly ClassReport[]): Record<ReportStatus, number> {
  const counts: Record<ReportStatus, number> = {
    draft: 0,
    submitted: 0,
    approved: 0,
    published: 0,
    withdrawn: 0,
  };
  for (const r of reports) counts[r.status] += 1;
  return counts;
}
