import "server-only";

import { forbidden, notFound } from "next/navigation";
import { cache } from "react";
import type { AppRole } from "@/lib/auth/roles";
import { getActiveSchool, getViewer, requireArea } from "@/lib/auth/viewer";
import type { MarkStatus } from "@/lib/grading/results";
import type { AssessmentType } from "@/lib/marks/assessments";
import { pickCurrentTerm, todayIn } from "@/lib/marks/terms";
import type { Band } from "@/lib/setup/bands";
import type { TermKind, TermStatus } from "@/lib/setup/calendar";
import { isUuid } from "@/lib/setup/structure";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the marks screens (US-4.1, US-4.2, US-4.5; D32). Everything
 * goes through the user-scoped client, so RLS and the security definer
 * functions' own checks decide what is visible; the checks here only pick
 * between a page, a 404 and a 403.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "marks", "Could not load the marks. Please try again.");
}

/** Enrolment statuses whose marks stay but can no longer be changed (D32). */
const LEFT_CLASS = new Set(["transferred", "left", "graduated"]);
export const isStillInClass = (status: string) => !LEFT_CLASS.has(status);

export type MarksActor = {
  schoolId: string;
  userId: string;
  roles: AppRole[];
  /** School admin or head: every class subject, never locked (D30). */
  isAdminOrHead: boolean;
};

function actorFrom(userId: string, school: { schoolId: string; roles: AppRole[] }): MarksActor {
  return {
    schoolId: school.schoolId,
    userId,
    roles: school.roles,
    isAdminOrHead: school.roles.includes("school_admin") || school.roles.includes("head"),
  };
}

/** The viewer of a marks page, or 403 (the proxy already checked the area). */
export async function requireMarksActor(area: "marks" | "teaching" = "marks"): Promise<MarksActor> {
  const { viewer, school } = await requireArea(area);
  const active = school ?? (await getActiveSchool(viewer));
  if (!active) forbidden();
  return actorFrom(viewer.userId, active);
}

/** The same for server actions, which answer with a message instead of a 403. */
export async function marksActor(): Promise<MarksActor | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const school = await getActiveSchool(viewer);
  if (!school) return null;
  const actor = actorFrom(viewer.userId, school);
  const teaches = school.roles.includes("teacher") || school.roles.includes("hod");
  return actor.isAdminOrHead || teaches ? actor : null;
}

/** Whether the actor may enter marks for a class subject taught by `teacherId`. */
export function mayEnterMarks(actor: MarksActor, teacherId: string | null): boolean {
  if (actor.isAdminOrHead) return true;
  const teaches = actor.roles.includes("teacher") || actor.roles.includes("hod");
  return teaches && teacherId === actor.userId;
}

// Terms ----------------------------------------------------------------------------

export type TermOption = {
  id: string;
  name: string;
  kind: TermKind;
  status: TermStatus;
  startsOn: string;
  endsOn: string;
  marksDeadline: string | null;
};

/**
 * The terms of the school's current year and the one to show: `wanted`
 * when it is one of them, else the current term by today's date in the
 * school's time zone.
 */
export async function resolveTerm(
  schoolId: string,
  wanted: string | string[] | undefined,
): Promise<{ terms: TermOption[]; term: TermOption | null }> {
  const supabase = await createClient();
  const [years, school] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, is_current, starts_on")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
    supabase.from("schools").select("timezone").eq("id", schoolId).maybeSingle(),
  ]);
  const yearRows = rows(years);
  const year = yearRows.find((y) => y.is_current) ?? yearRows[0];
  if (!year) return { terms: [], term: null };

  const terms = rows(
    await supabase
      .from("terms")
      .select("id, name, kind, status, starts_on, ends_on, marks_deadline")
      .eq("academic_year_id", year.id)
      .order("starts_on"),
  ).map(toTerm);
  const term =
    terms.find((t) => t.id === wanted) ??
    pickCurrentTerm(terms, todayIn(school.data?.timezone ?? "Africa/Harare"));
  return { terms, term };
}

function toTerm(t: {
  id: string;
  name: string;
  kind: TermKind;
  status: TermStatus;
  starts_on: string;
  ends_on: string;
  marks_deadline: string | null;
}): TermOption {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    status: t.status,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
    marksDeadline: t.marks_deadline,
  };
}

// Progress -------------------------------------------------------------------------

export type ClassSubjectProgress = {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
  learners: number;
  assessments: number;
  totalWeight: number;
  marksEntered: number;
};

/** Class subjects of the term the viewer may see marks for, with progress (D32). */
export async function listProgress(termId: string): Promise<ClassSubjectProgress[]> {
  const supabase = await createClient();
  return rows(await supabase.rpc("marks_progress", { p_term_id: termId })).map((r) => ({
    classSubjectId: r.class_subject_id,
    classId: r.class_id,
    className: r.class_name,
    subjectName: r.subject_name,
    teacherId: r.teacher_id ?? null,
    teacherName: r.teacher_name ?? null,
    learners: r.learners,
    assessments: r.assessments,
    totalWeight: Number(r.total_weight),
    marksEntered: r.marks_entered,
  }));
}

// One class subject in one term ------------------------------------------------------

export type ClassSubjectTerm = {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
  gradingScaleId: string;
  term: TermOption;
};

/**
 * A class subject and term of the actor's school, or 404; 403 unless the
 * actor may enter its marks (D32: its teacher, school admin or head). One
 * round trip: the class, subject, teacher and scale come embedded.
 */
export async function requireClassSubjectTerm(
  actor: MarksActor,
  classSubjectId: string,
  termId: string,
): Promise<ClassSubjectTerm> {
  if (!isUuid(classSubjectId) || !isUuid(termId)) notFound();
  const supabase = await createClient();
  const [cs, term] = await Promise.all([
    supabase
      .from("class_subjects")
      .select(
        "id, class_id, teacher_id, subjects!inner(name), profiles(full_name, email), classes!inner(name, academic_year_id, grade_levels!inner(grading_scale_id))",
      )
      .eq("id", classSubjectId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    supabase
      .from("terms")
      .select("id, name, kind, status, starts_on, ends_on, marks_deadline, academic_year_id")
      .eq("id", termId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
  ]);
  if (cs.error || term.error) rows({ data: null, error: cs.error ?? term.error });
  if (!cs.data) notFound();
  if (!mayEnterMarks(actor, cs.data.teacher_id)) forbidden();
  const klass = cs.data.classes;
  if (!term.data || term.data.academic_year_id !== klass.academic_year_id) notFound();

  return {
    classSubjectId: cs.data.id,
    classId: cs.data.class_id,
    className: klass.name,
    subjectName: cs.data.subjects.name,
    teacherId: cs.data.teacher_id,
    teacherName: cs.data.profiles?.full_name ?? cs.data.profiles?.email ?? null,
    gradingScaleId: klass.grade_levels.grading_scale_id,
    term: toTerm(term.data),
  };
}

/** The actor and class subject of a marks page; cached per request. */
export const loadClassSubjectPage = cache(
  async (
    classSubjectId: string,
    termId: string,
  ): Promise<{ actor: MarksActor; cst: ClassSubjectTerm }> => {
    const actor = await requireMarksActor();
    return { actor, cst: await requireClassSubjectTerm(actor, classSubjectId, termId) };
  },
);

export type AssessmentRow = {
  id: string;
  name: string;
  type: AssessmentType;
  maxMark: string;
  weightPercent: string;
  sortOrder: number;
  isLocked: boolean;
};

export async function listAssessments(
  classSubjectId: string,
  termId: string,
): Promise<AssessmentRow[]> {
  const supabase = await createClient();
  return rows(
    await supabase
      .from("assessments")
      .select("id, name, type, max_mark, weight_percent, sort_order, is_locked")
      .eq("class_subject_id", classSubjectId)
      .eq("term_id", termId)
      .order("sort_order")
      .order("created_at"),
  ).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    maxMark: String(a.max_mark),
    weightPercent: String(a.weight_percent),
    sortOrder: a.sort_order,
    isLocked: a.is_locked,
  }));
}

export type LockState = {
  /** Teachers cannot change these marks (term locked or closed, deadline passed). */
  teachersLocked: boolean;
  reason: string | null;
  marksDeadline: string | null;
  unlock: { reason: string; at: string; by: string | null } | null;
};

export async function getLockState(classSubjectId: string, termId: string): Promise<LockState> {
  const supabase = await createClient();
  const row = rows(
    await supabase.rpc("marks_lock", { p_class_subject_id: classSubjectId, p_term_id: termId }),
  )[0];
  if (!row) return { teachersLocked: true, reason: null, marksDeadline: null, unlock: null };
  return {
    teachersLocked: row.teachers_locked,
    reason: row.lock_reason ?? null,
    marksDeadline: row.marks_deadline ?? null,
    unlock: row.unlock_reason
      ? { reason: row.unlock_reason, at: row.unlocked_at, by: row.unlocked_by_name ?? null }
      : null,
  };
}

/** Who can unlock marks in the school: its active school admins and heads (D32). */
export async function listUnlockers(schoolId: string): Promise<{ name: string; role: string }[]> {
  const supabase = await createClient();
  return rows(await supabase.rpc("marks_unlockers", { p_school_id: schoolId })).map((r) => ({
    name: r.full_name,
    role: r.role,
  }));
}

export type GridLearner = {
  enrolmentId: string;
  learnerNumber: string;
  name: string;
  /** False for a learner who has left the class: shown with their marks, read-only. */
  stillInClass: boolean;
};

export type SavedMark = { status: MarkStatus; score: number | null };

export type SavedResult = {
  status: "complete" | "incomplete";
  roundedMark: number | null;
  grade: string | null;
  reason: string | null;
};

export type GridData = {
  assessments: AssessmentRow[];
  learners: GridLearner[];
  /** Keyed `${assessmentId}:${enrolmentId}`. */
  marks: Record<string, SavedMark>;
  bands: Band[];
  /** From public.subject_results(), keyed by enrolment. */
  saved: Record<string, SavedResult>;
};

/**
 * Everything the grid shows, in two rounds of parallel reads: assessments,
 * the learners who take the subject (still in the class, plus leavers who
 * have marks), their marks, the grade bands of the class's level and the
 * saved results.
 */
export async function loadGrid(cst: ClassSubjectTerm): Promise<GridData> {
  const supabase = await createClient();
  const [assessments, takers, bands, saved] = await Promise.all([
    listAssessments(cst.classSubjectId, cst.term.id),
    supabase
      .from("enrolment_subjects")
      .select("enrolments!inner(id, status, learners!inner(learner_number, first_name, last_name))")
      .eq("class_subject_id", cst.classSubjectId),
    supabase
      .from("grading_bands")
      .select("grade, min_mark, max_mark, remark")
      .eq("scale_id", cst.gradingScaleId)
      .order("min_mark", { ascending: false }),
    loadSavedResults(cst.classId, cst.term.id, cst.classSubjectId),
  ]);
  // By assessment id: filtering marks through an embedded assessments join
  // re-runs the marks policy per row and took about a second for 45 learners.
  const marks = assessments.length
    ? await supabase
        .from("marks")
        .select("assessment_id, enrolment_id, score, status")
        .in(
          "assessment_id",
          assessments.map((x) => x.id),
        )
    : { data: [], error: null };
  const enrolmentRows = rows(takers).map((t) => t.enrolments);

  const markMap: Record<string, SavedMark> = {};
  const hasMarks = new Set<string>();
  for (const m of rows(marks)) {
    markMap[`${m.assessment_id}:${m.enrolment_id}`] = {
      status: m.status,
      score: m.score === null ? null : Number(m.score),
    };
    hasMarks.add(m.enrolment_id);
  }

  const learners = enrolmentRows
    .map((e) => ({
      enrolmentId: e.id,
      learnerNumber: e.learners.learner_number,
      lastName: e.learners.last_name,
      name: `${e.learners.first_name} ${e.learners.last_name}`,
      stillInClass: isStillInClass(e.status),
    }))
    .filter((l) => l.stillInClass || hasMarks.has(l.enrolmentId))
    .sort(
      (a, b) =>
        Number(b.stillInClass) - Number(a.stillInClass) ||
        a.lastName.localeCompare(b.lastName) ||
        a.name.localeCompare(b.name),
    )
    .map((l) => ({
      enrolmentId: l.enrolmentId,
      learnerNumber: l.learnerNumber,
      name: l.name,
      stillInClass: l.stillInClass,
    }));

  return {
    assessments,
    learners,
    marks: markMap,
    bands: rows(bands).map((b) => ({
      grade: b.grade,
      minMark: b.min_mark,
      maxMark: b.max_mark,
      remark: b.remark,
    })),
    saved,
  };
}

/** Saved subject results of one class subject, keyed by enrolment (D31). */
export async function loadSavedResults(
  classId: string,
  termId: string,
  classSubjectId: string,
  enrolmentId?: string,
): Promise<Record<string, SavedResult>> {
  const supabase = await createClient();
  let query = supabase
    .rpc("subject_results", { p_class_id: classId, p_term_id: termId })
    .eq("class_subject_id", classSubjectId);
  if (enrolmentId) query = query.eq("enrolment_id", enrolmentId);
  const result: Record<string, SavedResult> = {};
  for (const r of rows(await query)) {
    result[r.enrolment_id] = {
      status: r.result_status === "complete" ? "complete" : "incomplete",
      roundedMark: r.rounded_mark ?? null,
      grade: r.grade ?? null,
      reason: r.incomplete_reason ?? null,
    };
  }
  return result;
}
