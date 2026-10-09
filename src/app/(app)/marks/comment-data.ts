import "server-only";

import { forbidden, notFound } from "next/navigation";
import type { BankEntry, CommentStatus } from "@/lib/comments/rules";
import { gradeFor, type Band } from "@/lib/setup/bands";
import { isUuid } from "@/lib/setup/structure";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { isStillInClass, requireMarksActor, type MarksActor, type TermOption } from "./data";

/**
 * Reads for the comment screens (US-5.1 to US-5.3; D34), through the
 * user-scoped client so the comments' RLS decides what is visible.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "comments", "Could not load the comments. Please try again.");
}

export type SavedComment = {
  text: string;
  status: CommentStatus;
  /** Subject comments only: when it was marked done. */
  signedAt: string | null;
};

/** Whether the actor may write subject comments for a class subject taught by `teacherId`. */
export function mayWriteSubjectComments(actor: MarksActor, teacherId: string | null): boolean {
  if (actor.roles.includes("school_admin")) return true;
  const teaches = actor.roles.includes("teacher") || actor.roles.includes("hod");
  return teaches && teacherId === actor.userId;
}

/** Subject comments of one class subject in a term, keyed by enrolment. */
export async function loadSubjectComments(
  classSubjectId: string,
  termId: string,
): Promise<Record<string, SavedComment>> {
  const supabase = await createClient();
  const result: Record<string, SavedComment> = {};
  for (const c of rows(
    await supabase
      .from("subject_comments")
      .select("enrolment_id, comment, status, signed_at")
      .eq("class_subject_id", classSubjectId)
      .eq("term_id", termId),
  )) {
    result[c.enrolment_id] = { text: c.comment, status: c.status, signedAt: c.signed_at };
  }
  return result;
}

export type BankRow = BankEntry & { subjectName: string | null; ownerName: string | null };

/** The viewer's own bank entries and those shared in their school (US-5.2). */
export async function listBank(actor: MarksActor): Promise<BankRow[]> {
  const supabase = await createClient();
  return rows(
    await supabase
      .from("comment_bank")
      .select(
        "id, owner_id, subject_id, grade, text, is_shared, subjects(name), profiles(full_name)",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at"),
  ).map((e) => ({
    id: e.id,
    text: e.text,
    subjectId: e.subject_id,
    grade: e.grade,
    isShared: e.is_shared,
    isMine: e.owner_id === actor.userId,
    subjectName: e.subjects?.name ?? null,
    ownerName: e.profiles?.full_name ?? null,
  }));
}

// Class teacher screen (US-5.3) ----------------------------------------------------------

export type ClassTerm = {
  classId: string;
  className: string;
  classTeacherId: string | null;
  term: TermOption;
};

/**
 * A class and term of the actor's school, or 404; 403 unless the actor is
 * its class teacher, the school admin or the head.
 */
export async function requireClassTerm(
  classId: string,
  termId: string,
): Promise<{ actor: MarksActor; ct: ClassTerm; isClassTeacher: boolean }> {
  const actor = await requireMarksActor();
  if (!isUuid(classId) || !isUuid(termId)) notFound();
  const supabase = await createClient();
  const [klass, term] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, academic_year_id, class_teacher_id")
      .eq("id", classId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    supabase
      .from("terms")
      .select("id, name, kind, status, starts_on, ends_on, marks_deadline, academic_year_id")
      .eq("id", termId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
  ]);
  if (klass.error || term.error) rows({ data: null, error: klass.error ?? term.error });
  if (!klass.data) notFound();
  const teaches = actor.roles.includes("teacher") || actor.roles.includes("hod");
  const isClassTeacher = teaches && klass.data.class_teacher_id === actor.userId;
  if (!isClassTeacher && !actor.isAdminOrHead) forbidden();
  if (!term.data || term.data.academic_year_id !== klass.data.academic_year_id) notFound();
  const t = term.data;
  return {
    actor,
    isClassTeacher,
    ct: {
      classId: klass.data.id,
      className: klass.data.name,
      classTeacherId: klass.data.class_teacher_id,
      term: {
        id: t.id,
        name: t.name,
        kind: t.kind,
        status: t.status,
        startsOn: t.starts_on,
        endsOn: t.ends_on,
        marksDeadline: t.marks_deadline,
      },
    },
  };
}

export type ClassLearnerResult = {
  enrolmentId: string;
  learnerNumber: string;
  name: string;
  subjects: {
    classSubjectId: string;
    subjectName: string;
    status: "complete" | "incomplete";
    mark: number | null;
    grade: string | null;
    reason: string | null;
  }[];
  average: number | null;
  /** Grade of the average rounded to a whole mark, for bank suggestions. */
  averageGrade: string | null;
  position: number | null;
  classSize: number | null;
};

export type ClassCommentLock = {
  teachersLocked: boolean;
  reason: string | null;
  marksDeadline: string | null;
};

/**
 * Everything the class teacher screen shows: each learner still in the
 * class with their subject results and grades (public.subject_results()),
 * average and position (public.class_positions()), and class comments.
 */
export async function loadClassResults(ct: ClassTerm): Promise<{
  learners: ClassLearnerResult[];
  comments: Record<string, SavedComment>;
  lock: ClassCommentLock;
}> {
  const supabase = await createClient();
  const [enrolments, subjects, results, positions, comments, lock, klass] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id, status, learners!inner(learner_number, first_name, last_name)")
      .eq("class_id", ct.classId),
    supabase
      .from("class_subjects")
      .select("id, subjects!inner(name, sort_order)")
      .eq("class_id", ct.classId),
    supabase.rpc("subject_results", { p_class_id: ct.classId, p_term_id: ct.term.id }),
    supabase.rpc("class_positions", { p_class_id: ct.classId, p_term_id: ct.term.id }),
    supabase
      .from("class_comments")
      .select("enrolment_id, comment, status, enrolments!inner(class_id)")
      .eq("term_id", ct.term.id)
      .eq("enrolments.class_id", ct.classId),
    supabase.rpc("class_comment_lock", { p_class_id: ct.classId, p_term_id: ct.term.id }),
    supabase
      .from("classes")
      .select("grade_levels!inner(grading_scale_id)")
      .eq("id", ct.classId)
      .single(),
  ]);
  if (klass.error) rows({ data: null, error: klass.error });
  const bands: Band[] = rows(
    await supabase
      .from("grading_bands")
      .select("grade, min_mark, max_mark, remark")
      .eq("scale_id", klass.data!.grade_levels.grading_scale_id),
  ).map((b) => ({ grade: b.grade, minMark: b.min_mark, maxMark: b.max_mark, remark: b.remark }));

  const subjectInfo = new Map(
    rows(subjects).map((s) => [s.id, { name: s.subjects.name, order: s.subjects.sort_order }]),
  );
  const byEnrolment = new Map<string, ClassLearnerResult["subjects"]>();
  for (const r of rows(results)) {
    const list = byEnrolment.get(r.enrolment_id) ?? [];
    list.push({
      classSubjectId: r.class_subject_id,
      subjectName: subjectInfo.get(r.class_subject_id)?.name ?? "Subject",
      status: r.result_status === "complete" ? "complete" : "incomplete",
      mark: r.rounded_mark ?? null,
      grade: r.grade ?? null,
      reason: r.incomplete_reason ?? null,
    });
    byEnrolment.set(r.enrolment_id, list);
  }
  const order = (id: string) => subjectInfo.get(id)?.order ?? 0;
  const positionOf = new Map(rows(positions).map((p) => [p.enrolment_id, p]));

  const learners = rows(enrolments)
    .filter((e) => isStillInClass(e.status))
    .map((e) => {
      const p = positionOf.get(e.id);
      const average = p?.average == null ? null : Number(p.average);
      return {
        enrolmentId: e.id,
        learnerNumber: e.learners.learner_number,
        // Sorting only; the screen does not use it.
        lastName: e.learners.last_name,
        name: `${e.learners.first_name} ${e.learners.last_name}`,
        subjects: (byEnrolment.get(e.id) ?? []).sort(
          (a, b) =>
            order(a.classSubjectId) - order(b.classSubjectId) ||
            a.subjectName.localeCompare(b.subjectName),
        ),
        average,
        averageGrade: average == null ? null : gradeFor(bands, Math.floor(average + 0.5)),
        position: p?.position ?? null,
        classSize: p?.class_size ?? null,
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name));

  const commentMap: Record<string, SavedComment> = {};
  for (const c of rows(comments)) {
    commentMap[c.enrolment_id] = { text: c.comment, status: c.status, signedAt: null };
  }
  const lockRow = rows(lock)[0];
  return {
    learners,
    comments: commentMap,
    lock: lockRow
      ? {
          teachersLocked: lockRow.teachers_locked,
          reason: lockRow.lock_reason ?? null,
          marksDeadline: lockRow.marks_deadline ?? null,
        }
      : { teachersLocked: true, reason: null, marksDeadline: null },
  };
}

/**
 * Classes of the term's year: those the actor is class teacher of (for My
 * classes), or every class (for the school admin and head).
 */
export async function listClassesForTerm(
  actor: MarksActor,
  termId: string,
  onlyMine: boolean,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data: term } = await supabase
    .from("terms")
    .select("academic_year_id")
    .eq("id", termId)
    .maybeSingle();
  if (!term) return [];
  const academicYearId = term.academic_year_id;
  let query = supabase
    .from("classes")
    .select("id, name")
    .eq("school_id", actor.schoolId)
    .eq("academic_year_id", academicYearId);
  if (onlyMine) query = query.eq("class_teacher_id", actor.userId);
  return rows(await query.order("name"));
}
