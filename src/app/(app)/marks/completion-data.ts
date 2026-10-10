import "server-only";

import type { ClassCompletion, ClassSubjectCompletion } from "@/lib/marks/completion";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "completion", "Could not load what is missing. Please try again.");
}

/**
 * What is still missing for a term (US-4.8, D36): two set-based calls for
 * the whole school. The functions decide what the viewer sees (all for
 * school admin and head, a teacher's own class subjects and classes).
 */
export async function loadCompletion(
  termId: string,
): Promise<{ classSubjects: ClassSubjectCompletion[]; classes: ClassCompletion[] }> {
  const supabase = await createClient();
  const [subjects, classes] = await Promise.all([
    supabase.rpc("completion_class_subjects", { p_term_id: termId }),
    supabase.rpc("completion_classes", { p_term_id: termId }),
  ]);
  return {
    classSubjects: rows(subjects).map((r) => ({
      classSubjectId: r.class_subject_id,
      classId: r.class_id,
      className: r.class_name,
      subjectName: r.subject_name,
      teacherId: r.teacher_id ?? null,
      teacherName: r.teacher_name ?? null,
      learners: r.learners,
      assessments: r.assessments,
      totalWeight: Number(r.total_weight),
      marksMissing: r.marks_missing,
      commentsMissing: r.comments_missing,
    })),
    classes: rows(classes).map((r) => ({
      classId: r.class_id,
      className: r.class_name,
      classTeacherId: r.class_teacher_id ?? null,
      classTeacherName: r.class_teacher_name ?? null,
      learners: r.learners,
      classCommentsMissing: r.class_comments_missing ?? null,
    })),
  };
}
