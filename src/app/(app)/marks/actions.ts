"use server";

import { revalidatePath } from "next/cache";
import { parseAssessment, usualSet } from "@/lib/marks/assessments";
import { parseCell } from "@/lib/marks/cell";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, saved, type FormState } from "../platform/form-state";
import {
  isStillInClass,
  loadSavedResults,
  marksActor,
  mayEnterMarks,
  type MarksActor,
  type SavedMark,
  type SavedResult,
} from "./data";

/**
 * Marks screen actions (US-4.1, US-4.2, US-4.4, US-4.5; D32). Each checks
 * the caller may enter this class subject's marks (its teacher, school
 * admin or head) and validates input with the pure rules in src/lib/marks;
 * writes go through the user-scoped client, so RLS, the lock triggers and
 * the audit trigger (D30) apply as well.
 */

const NOT_ALLOWED = "Only the subject's teacher, the school admin or the head can do this.";
const LOCKED = "Marks for this subject are locked. Ask the school admin or head to unlock them.";
const TRY_AGAIN = "Could not save. Check your connection and try again.";

function dbMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501") return error.message.includes("locked") ? LOCKED : NOT_ALLOWED;
  if (error.code === "23514" || error.code === "22023" || error.code === "P0001") {
    const m = error.message;
    return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
  }
  return TRY_AGAIN;
}

function marksPath(classSubjectId: string, termId: string, rest = ""): string {
  return `/marks/${classSubjectId}/${termId}${rest}`;
}

function revalidateMarks(classSubjectId: string, termId: string) {
  revalidatePath(marksPath(classSubjectId, termId));
  revalidatePath(marksPath(classSubjectId, termId, "/assessments"));
}

/** The class subject, when the actor may enter its marks and it is in their school. */
async function classSubjectFor(
  actor: MarksActor,
  classSubjectId: unknown,
): Promise<{ id: string; classId: string } | null> {
  if (!isUuid(classSubjectId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, class_id, teacher_id")
    .eq("id", classSubjectId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!data || !mayEnterMarks(actor, data.teacher_id)) return null;
  return { id: data.id, classId: data.class_id };
}

// Marks ----------------------------------------------------------------------------

export type SaveMarkResult =
  { ok: true; mark: SavedMark; saved: SavedResult | null } | { ok: false; message: string };

/**
 * Saves one grid cell (US-4.2 autosave): a score, "A" (absent) or "E"
 * (excused). A saved mark is never deleted (rule 6), so a blank cell is
 * refused rather than removing it. Returns the learner's saved subject
 * result from public.subject_results() (D31).
 */
export async function saveMark(input: {
  assessmentId: string;
  enrolmentId: string;
  value: string;
}): Promise<SaveMarkResult> {
  const actor = await marksActor();
  if (!actor) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(input.assessmentId) || !isUuid(input.enrolmentId) || typeof input.value !== "string")
    return { ok: false, message: TRY_AGAIN };

  const supabase = await createClient();
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, class_subject_id, term_id, max_mark")
    .eq("id", input.assessmentId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!assessment) return { ok: false, message: NOT_ALLOWED };
  const classSubject = await classSubjectFor(actor, assessment.class_subject_id);
  if (!classSubject) return { ok: false, message: NOT_ALLOWED };

  const [{ data: takes }, { data: enrolment }] = await Promise.all([
    supabase
      .from("enrolment_subjects")
      .select("id")
      .eq("enrolment_id", input.enrolmentId)
      .eq("class_subject_id", classSubject.id)
      .maybeSingle(),
    supabase.from("enrolments").select("status").eq("id", input.enrolmentId).maybeSingle(),
  ]);
  if (!takes || !enrolment)
    return { ok: false, message: "This learner does not take the subject." };
  if (!isStillInClass(enrolment.status))
    return { ok: false, message: "This learner has left the class, so their marks are read-only." };

  const value = parseCell(input.value, String(assessment.max_mark));
  if (value.kind === "invalid") return { ok: false, message: value.message };
  if (value.kind === "empty")
    return { ok: false, message: "Enter a mark, A or E. A saved mark is never deleted." };

  const mark =
    value.kind === "score"
      ? { status: "present" as const, score: value.score }
      : { status: value.kind, score: null };
  const { data, error } = await supabase
    .from("marks")
    .upsert(
      {
        school_id: actor.schoolId,
        assessment_id: assessment.id,
        enrolment_id: input.enrolmentId,
        status: mark.status,
        score: mark.score === null ? null : Number(mark.score),
      },
      { onConflict: "assessment_id,enrolment_id" },
    )
    .select("score, status")
    .single();
  if (error) return { ok: false, message: dbMessage(error) };

  const results = await loadSavedResults(
    classSubject.classId,
    assessment.term_id,
    classSubject.id,
    input.enrolmentId,
  ).catch(() => ({}) as Record<string, SavedResult>);
  return {
    ok: true,
    mark: { status: data.status, score: data.score === null ? null : Number(data.score) },
    saved: results[input.enrolmentId] ?? null,
  };
}

// Assessments ------------------------------------------------------------------------

function readAssessment(formData: FormData) {
  return parseAssessment({
    name: formData.get("name"),
    type: formData.get("type"),
    maxMark: formData.get("maxMark"),
    weightPercent: formData.get("weightPercent"),
  });
}

async function nextSortOrder(classSubjectId: string, termId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select("sort_order")
    .eq("class_subject_id", classSubjectId)
    .eq("term_id", termId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? 0) + 1;
}

/** US-4.1: one new assessment. */
export async function createAssessment(
  classSubjectId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await marksActor();
  const cs = actor && (await classSubjectFor(actor, classSubjectId));
  if (!actor || !cs || !isUuid(termId)) return failed(NOT_ALLOWED);
  const parsed = readAssessment(formData);
  if (!parsed.ok) return failed("Check the assessment's details.", parsed.errors);

  const supabase = await createClient();
  const { error } = await supabase.from("assessments").insert({
    school_id: actor.schoolId,
    term_id: termId,
    class_subject_id: cs.id,
    name: parsed.value.name,
    type: parsed.value.type,
    max_mark: Number(parsed.value.maxMark),
    weight_percent: Number(parsed.value.weightPercent),
    sort_order: await nextSortOrder(cs.id, termId),
  });
  if (error) return failed(dbMessage(error));
  revalidateMarks(cs.id, termId);
  return saved(`${parsed.value.name} added.`);
}

/** US-4.1: the school's usual set in one tap, when the class subject has none yet. */
export async function addUsualAssessments(
  classSubjectId: string,
  termId: string,
): Promise<FormState> {
  const actor = await marksActor();
  const cs = actor && (await classSubjectFor(actor, classSubjectId));
  if (!actor || !cs || !isUuid(termId)) return failed(NOT_ALLOWED);

  const supabase = await createClient();
  const [{ data: term }, { count }] = await Promise.all([
    supabase.from("terms").select("kind").eq("id", termId).maybeSingle(),
    supabase
      .from("assessments")
      .select("id", { count: "exact", head: true })
      .eq("class_subject_id", cs.id)
      .eq("term_id", termId),
  ]);
  if (!term) return failed(NOT_ALLOWED);
  if (count) return failed("This subject already has assessments this term.");

  const set = usualSet(term.kind);
  const { error } = await supabase.from("assessments").insert(
    set.map((a, i) => ({
      school_id: actor.schoolId,
      term_id: termId,
      class_subject_id: cs.id,
      name: a.name,
      type: a.type,
      max_mark: Number(a.maxMark),
      weight_percent: Number(a.weightPercent),
      sort_order: i + 1,
    })),
  );
  if (error) return failed(dbMessage(error));
  revalidateMarks(cs.id, termId);
  return saved(`${set.map((a) => a.name).join(", ")} added.`);
}

/** The assessment, when the actor may change it. */
async function assessmentFor(actor: MarksActor, assessmentId: string) {
  if (!isUuid(assessmentId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select("id, class_subject_id, term_id, name")
    .eq("id", assessmentId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!data || !(await classSubjectFor(actor, data.class_subject_id))) return null;
  return data;
}

/** US-4.1: change an assessment's name, type, maximum or weight. */
export async function updateAssessment(
  assessmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await marksActor();
  const assessment = actor && (await assessmentFor(actor, assessmentId));
  if (!actor || !assessment) return failed(NOT_ALLOWED);
  const parsed = readAssessment(formData);
  if (!parsed.ok) return failed("Check the assessment's details.", parsed.errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .update({
      name: parsed.value.name,
      type: parsed.value.type,
      max_mark: Number(parsed.value.maxMark),
      weight_percent: Number(parsed.value.weightPercent),
    })
    .eq("id", assessment.id)
    .select("id");
  if (error) return failed(dbMessage(error));
  if (data.length !== 1) return failed(NOT_ALLOWED);
  revalidateMarks(assessment.class_subject_id, assessment.term_id);
  return saved(`${parsed.value.name} saved.`);
}

/** US-4.1: remove an assessment that has no marks yet (marks are never deleted). */
export async function deleteAssessment(assessmentId: string): Promise<FormState> {
  const actor = await marksActor();
  const assessment = actor && (await assessmentFor(actor, assessmentId));
  if (!actor || !assessment) return failed(NOT_ALLOWED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessment.id)
    .select("id");
  if (error?.code === "23503")
    return failed(
      `${assessment.name} has marks, so it cannot be removed. Change its marks instead.`,
    );
  if (error) return failed(dbMessage(error));
  if (data.length !== 1) return failed(NOT_ALLOWED);
  revalidateMarks(assessment.class_subject_id, assessment.term_id);
  return saved(`${assessment.name} removed.`);
}

// Unlock and relock (US-4.5) ------------------------------------------------------------

/** School admin or head: let the teacher change this term's marks after the lock, with a reason. */
export async function unlockMarks(
  classSubjectId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await marksActor();
  if (!actor?.isAdminOrHead || !(await classSubjectFor(actor, classSubjectId)) || !isUuid(termId))
    return failed("Only the school admin or head can unlock marks.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return failed(null, { reason: "Give a reason for unlocking." });
  if (reason.length > 500) return failed(null, { reason: "Keep the reason under 500 characters." });

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_class_subject", {
    p_class_subject_id: classSubjectId,
    p_term_id: termId,
    p_reason: reason,
  });
  if (error) return failed(dbMessage(error));
  revalidateMarks(classSubjectId, termId);
  return saved("Unlocked. The teacher can change these marks until you relock them.");
}

export async function relockMarks(classSubjectId: string, termId: string): Promise<FormState> {
  const actor = await marksActor();
  if (!actor?.isAdminOrHead || !(await classSubjectFor(actor, classSubjectId)) || !isUuid(termId))
    return failed("Only the school admin or head can relock marks.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("relock_class_subject", {
    p_class_subject_id: classSubjectId,
    p_term_id: termId,
  });
  if (error) return failed(dbMessage(error));
  revalidateMarks(classSubjectId, termId);
  return saved("Relocked.");
}
