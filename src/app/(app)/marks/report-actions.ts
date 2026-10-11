"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type DbError } from "@/lib/db-errors";
import { makeClassPdfBatch, type PdfBatchResult } from "@/lib/reports/pdf-files";
import { portalUrl } from "@/lib/reports/portal-url";
import { HEAD_COMMENT_MAX, RETURN_NOTE_MAX, describeGeneration } from "@/lib/reports/workflow";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, saved, type FormState } from "../platform/form-state";
import { marksActor } from "./data";

/**
 * Report workflow actions (US-6.1 to US-6.3, US-5.4; D44). Each calls one
 * database function through the user-scoped client; the function checks
 * the caller's role and the reports' state, so these only validate input
 * and put the answer in plain words.
 */

const TRY_AGAIN = "Could not save. Check your connection and try again.";
const CLASS_TEACHER = "Only the class teacher can do this.";
const HEAD = "Only the head can do this.";

function message(error: DbError, notAllowed: string): string {
  return dbErrorMessage(error, { notAllowed, fallback: TRY_AGAIN });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function revalidate(classId: string, termId: string) {
  revalidatePath(`/marks/classes/${classId}/${termId}`);
  revalidatePath(`/head/reports/${classId}/${termId}`);
  revalidatePath("/head");
}

// Class teacher -----------------------------------------------------------------------

/** US-6.1: one draft per learner with nothing missing; refreshes existing drafts. */
export async function generateDrafts(
  classId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_report_drafts", {
    p_class_id: classId,
    p_term_id: termId,
    p_include_incomplete_results: formData.get("includeIncomplete") === "on",
  });
  if (error) return failed(message(error, CLASS_TEACHER));
  revalidate(classId, termId);
  return saved(describeGeneration((data ?? []).map((d) => d.outcome)));
}

/** US-6.2: sends every draft of the class to the head. */
export async function submitReports(classId: string, termId: string): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_class_reports", {
    p_class_id: classId,
    p_term_id: termId,
  });
  if (error) return failed(message(error, CLASS_TEACHER));
  revalidate(classId, termId);
  return saved(`Submitted ${plural(data, "report", "reports")} to the head.`);
}

// Head ------------------------------------------------------------------------------------

/** US-6.2: back to the class teacher as drafts, with a note they see. */
export async function returnReports(
  classId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return failed("Check the note.", { note: "Say what the class teacher should fix." });
  if (note.length > RETURN_NOTE_MAX)
    return failed("Check the note.", { note: `Use at most ${RETURN_NOTE_MAX} characters.` });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_class_reports", {
    p_class_id: classId,
    p_term_id: termId,
    p_note: note,
  });
  if (error) return failed(message(error, HEAD));
  revalidate(classId, termId);
  return saved(`Returned ${plural(data, "report", "reports")} to the class teacher.`);
}

export async function approveReports(classId: string, termId: string): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_class_reports", {
    p_class_id: classId,
    p_term_id: termId,
  });
  if (error) return failed(message(error, HEAD));
  revalidate(classId, termId);
  return saved(`Approved ${plural(data, "report", "reports")}.`);
}

/**
 * US-6.3: freezes each approved report's snapshot and gives it its codes.
 * The head's screen then makes the PDFs a few at a time (makeReportPdfs).
 */
export async function publishReports(classId: string, termId: string): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_class_reports", {
    p_class_id: classId,
    p_term_id: termId,
  });
  if (error) return failed(message(error, HEAD));
  revalidate(classId, termId);
  return saved(
    `Published ${plural(data, "report", "reports")}. Learners and parents can now see ${data === 1 ? "it" : "them"}.`,
  );
}

/** US-5.4: the head's comment on one learner's report. */
export async function saveHeadComment(
  reportId: string,
  classId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!isUuid(reportId) || !isUuid(classId) || !isUuid(termId)) return failed(TRY_AGAIN);
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > HEAD_COMMENT_MAX)
    return failed(`Use at most ${HEAD_COMMENT_MAX} characters so it fits on the report.`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_report_head_comment", {
    p_report_id: reportId,
    p_comment: comment,
  });
  if (error) return failed(message(error, HEAD));
  revalidate(classId, termId);
  return saved(comment ? "Head's comment saved." : "Head's comment removed.");
}

/** REPORT_LAYOUT section 4: the explicit "result not available" line, or undoing it. */
export async function setResultNotAvailable(
  reportId: string,
  classSubjectId: string,
  notAvailable: boolean,
  classId: string,
  termId: string,
): Promise<FormState> {
  if (!isUuid(reportId) || !isUuid(classSubjectId) || !isUuid(classId) || !isUuid(termId))
    return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_report_result_not_available", {
    p_report_id: reportId,
    p_class_subject_id: classSubjectId,
    p_not_available: notAvailable,
  });
  if (error) return failed(message(error, HEAD));
  revalidate(classId, termId);
  return saved(notAvailable ? "Marked “result not available”." : "The result is needed again.");
}

// Report PDFs (US-6.3, US-6.4; D45) --------------------------------------------------------

/**
 * The next few PDFs of a class's published reports; the head's screen calls
 * this again until every report has its PDF. `skip` holds reports that
 * failed earlier in this run, so one bad report does not stop the rest;
 * "Try again" sends an empty list.
 */
export async function makeReportPdfs(
  classId: string,
  termId: string,
  skip: string[],
): Promise<PdfBatchResult | { error: string }> {
  if (!isUuid(classId) || !isUuid(termId) || !Array.isArray(skip) || !skip.every(isUuid))
    return { error: TRY_AGAIN };
  const actor = await marksActor();
  if (!actor || !actor.roles.includes("head")) return { error: HEAD };
  try {
    // No revalidation here: the screen refreshes once the run is over.
    return await makeClassPdfBatch(
      actor.schoolId,
      classId,
      termId,
      skip.slice(0, 100),
      await portalUrl(),
    );
  } catch {
    return { error: "Could not make the PDFs. Check your connection and try again." };
  }
}
