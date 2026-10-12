import "server-only";

import { notFound } from "next/navigation";
import type { AppRole } from "@/lib/auth/roles";
import type { ClassCompletion, ClassSubjectCompletion } from "@/lib/marks/completion";
import { countReports, type ReportCounts } from "@/lib/oversight/summary";
import { pickCurrentTerm, todayIn } from "@/lib/marks/terms";
import { isUuid } from "@/lib/setup/structure";
import type { TermKind } from "@/lib/setup/calendar";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { loadCompletion } from "../../marks/completion-data";
import { isStillInClass } from "../../marks/data";
import type { Overseer } from "../oversight-data";

/**
 * Reads for the read-only profiles (US-9.2, D51). Through the user-scoped
 * client, so RLS and the grade functions decide what each viewer sees: the
 * whole school for admin and head; for a hod, the learners and classes
 * they teach, their own class subjects' marks and comments, and only their
 * own staff profile (D23, D30, D36). Something they may not see is a 404.
 * Each page makes a fixed number of calls, whatever the number of rows; the
 * learner's results take two per term of the year shown.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "browse", "Could not load this page. Please try again.");
}

function one<T>(result: { data: T | null; error: { code?: string } | null }): T {
  if (result.error) rows({ data: null, error: result.error });
  if (!result.data) notFound();
  return result.data;
}

export type TermInfo = {
  id: string;
  name: string;
  kind: TermKind;
  startsOn: string;
  endsOn: string;
};

export type SubjectResult = {
  classSubjectId: string;
  subjectName: string;
  order: number;
  complete: boolean;
  mark: number | null;
  grade: string | null;
  reason: string | null;
  comment: { text: string; done: boolean } | null;
};

export type TermResults = {
  term: TermInfo;
  subjects: SubjectResult[];
  average: number | null;
  position: number | null;
  classSize: number | null;
  classComment: { text: string; done: boolean } | null;
};

export type LearnerReport = {
  id: string;
  termName: string;
  version: number;
  status: string;
  publishedAt: string | null;
  hasPdf: boolean;
};

export type LearnerProfile = {
  id: string;
  name: string;
  number: string;
  status: string;
  years: { enrolmentId: string; label: string; className: string; yearId: string }[];
  year: {
    enrolmentId: string;
    classId: string;
    className: string;
    label: string;
    status: string;
  } | null;
  subjects: { name: string; teacher: string | null }[];
  results: TermResults[];
  reports: LearnerReport[];
  guardians: {
    name: string;
    relationship: string;
    isPrimary: boolean;
    phone: string | null;
    email: string | null;
    hasLogin: boolean;
  }[];
};

/** One learner with one year's class, subjects, results, comments and reports (newest year unless `wantedYear`). */
export async function loadLearnerProfile(
  o: Overseer,
  learnerId: string,
  wantedYear: string | undefined,
): Promise<LearnerProfile> {
  if (!isUuid(learnerId)) notFound();
  const supabase = await createClient();
  const [learnerResult, enrolmentResult, linkResult] = await Promise.all([
    supabase
      .from("learners")
      .select("id, first_name, last_name, learner_number, status")
      .eq("id", learnerId)
      .eq("school_id", o.schoolId)
      .maybeSingle(),
    supabase
      .from("enrolments")
      .select(
        "id, status, class_id, academic_year_id, classes!inner(name, academic_years!inner(label, starts_on))",
      )
      .eq("learner_id", learnerId)
      .eq("school_id", o.schoolId),
    supabase
      .from("guardian_links")
      .select("relationship, is_primary, guardians!inner(full_name, phone, email, user_id)")
      .eq("learner_id", learnerId)
      .eq("school_id", o.schoolId),
  ]);
  const learner = one(learnerResult);
  const enrolments = rows(enrolmentResult).sort((a, b) =>
    b.classes.academic_years.starts_on.localeCompare(a.classes.academic_years.starts_on),
  );
  const chosen = enrolments.find((e) => e.academic_year_id === wantedYear) ?? enrolments[0];

  const base = {
    id: learner.id,
    name: `${learner.first_name} ${learner.last_name}`,
    number: learner.learner_number,
    status: learner.status,
    years: enrolments.map((e) => ({
      enrolmentId: e.id,
      label: e.classes.academic_years.label,
      className: e.classes.name,
      yearId: e.academic_year_id,
    })),
    guardians: rows(linkResult)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((l) => ({
        name: l.guardians.full_name,
        relationship: l.relationship,
        isPrimary: l.is_primary,
        phone: l.guardians.phone ?? null,
        email: l.guardians.email ?? null,
        hasLogin: l.guardians.user_id != null,
      })),
  };
  if (!chosen) return { ...base, year: null, subjects: [], results: [], reports: [] };

  const [choices, terms, subjectComments, classComments, reports] = await Promise.all([
    supabase
      .from("enrolment_subjects")
      .select(
        "class_subject_id, class_subjects!inner(subjects!inner(name, sort_order), teacher:profiles!class_subjects_teacher_id_fkey(full_name))",
      )
      .eq("enrolment_id", chosen.id),
    supabase
      .from("terms")
      .select("id, name, kind, starts_on, ends_on")
      .eq("academic_year_id", chosen.academic_year_id)
      .order("starts_on"),
    supabase
      .from("subject_comments")
      .select("term_id, class_subject_id, comment, status")
      .eq("enrolment_id", chosen.id),
    supabase
      .from("class_comments")
      .select("term_id, comment, status")
      .eq("enrolment_id", chosen.id),
    supabase
      .from("reports")
      .select("id, term_id, version, status, published_at, pdf_path")
      .eq("enrolment_id", chosen.id)
      .order("version", { ascending: false }),
  ]);
  const termRows: TermInfo[] = rows(terms).map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
  }));
  // The grade functions, once per term of the year: the same results the
  // marks and class teacher's screens show (D31), never worked out here.
  const perTerm = await Promise.all(
    termRows.map((t) =>
      Promise.all([
        supabase.rpc("subject_results", { p_class_id: chosen.class_id, p_term_id: t.id }),
        supabase.rpc("class_positions", { p_class_id: chosen.class_id, p_term_id: t.id }),
      ]),
    ),
  );

  const subjectInfo = new Map(
    rows(choices).map((c) => [
      c.class_subject_id,
      {
        name: c.class_subjects.subjects.name,
        order: c.class_subjects.subjects.sort_order,
        teacher: c.class_subjects.teacher?.full_name ?? null,
      },
    ]),
  );
  const commentRows = rows(subjectComments);
  const classCommentRows = rows(classComments);
  const termName = new Map(termRows.map((t) => [t.id, t.name]));

  const results: TermResults[] = termRows.map((term, i) => {
    const [subjectResult, positionResult] = perTerm[i]!;
    const mine = rows(subjectResult).filter((r) => r.enrolment_id === chosen.id);
    const position = rows(positionResult).find((p) => p.enrolment_id === chosen.id);
    const cc = classCommentRows.find((c) => c.term_id === term.id && c.comment.trim());
    return {
      term,
      subjects: mine
        .map((r) => {
          const info = subjectInfo.get(r.class_subject_id);
          const c = commentRows.find(
            (x) =>
              x.term_id === term.id &&
              x.class_subject_id === r.class_subject_id &&
              x.comment.trim(),
          );
          return {
            classSubjectId: r.class_subject_id,
            subjectName: info?.name ?? "Subject",
            order: info?.order ?? 0,
            complete: r.result_status === "complete",
            mark: r.rounded_mark ?? null,
            grade: r.grade ?? null,
            reason: r.incomplete_reason ?? null,
            comment: c ? { text: c.comment, done: c.status === "submitted" } : null,
          };
        })
        .sort((a, b) => a.order - b.order || a.subjectName.localeCompare(b.subjectName)),
      average: position?.average == null ? null : Number(position.average),
      position: position?.position ?? null,
      classSize: position?.class_size ?? null,
      classComment: cc ? { text: cc.comment, done: cc.status === "submitted" } : null,
    };
  });

  return {
    ...base,
    year: {
      enrolmentId: chosen.id,
      classId: chosen.class_id,
      className: chosen.classes.name,
      label: chosen.classes.academic_years.label,
      status: chosen.status,
    },
    subjects: [...subjectInfo.values()]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((s) => ({ name: s.name, teacher: s.teacher })),
    results,
    reports: rows(reports).map((r) => ({
      id: r.id,
      termName: termName.get(r.term_id) ?? "Term",
      version: r.version,
      status: r.status,
      publishedAt: r.published_at ?? null,
      hasPdf: r.pdf_path != null && (r.status === "published" || r.status === "withdrawn"),
    })),
  };
}

/** The school's current academic year, else its newest. */
async function currentYearId(schoolId: string): Promise<string | null> {
  const supabase = await createClient();
  const years = rows(
    await supabase
      .from("academic_years")
      .select("id, is_current")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
  );
  return (years.find((y) => y.is_current) ?? years[0])?.id ?? null;
}

// Staff -------------------------------------------------------------------------------

export type StaffProfile = {
  id: string;
  name: string;
  email: string | null;
  roles: { role: AppRole; status: string }[];
  classSubjects: { id: string; classId: string; className: string; subjectName: string }[];
  classes: { id: string; name: string }[];
  owed: { classSubjects: ClassSubjectCompletion[]; classes: ClassCompletion[] };
};

/** A staff member's class subjects and classes this year and what they still owe this term. */
export async function loadStaffProfile(
  o: Overseer,
  userId: string,
  termId: string | null,
): Promise<StaffProfile> {
  if (!isUuid(userId)) notFound();
  // A hod sees only their own (D23, D36).
  if (!o.isAdminOrHead && userId !== o.userId) notFound();
  const supabase = await createClient();
  const yearId = await currentYearId(o.schoolId);
  const [staff, profile, subjects, classes, owed] = await Promise.all([
    o.isAdminOrHead ? supabase.rpc("school_staff", { p_school_id: o.schoolId }) : null,
    supabase.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
    yearId
      ? supabase
          .from("class_subjects")
          .select(
            "id, class_id, classes!inner(name, academic_year_id), subjects!inner(name, sort_order)",
          )
          .eq("teacher_id", userId)
          .eq("school_id", o.schoolId)
          .eq("classes.academic_year_id", yearId)
      : null,
    yearId
      ? supabase
          .from("classes")
          .select("id, name")
          .eq("class_teacher_id", userId)
          .eq("school_id", o.schoolId)
          .eq("academic_year_id", yearId)
          .order("name")
      : null,
    termId ? loadCompletion(termId) : Promise.resolve({ classSubjects: [], classes: [] }),
  ]);
  const memberships = staff ? rows(staff).filter((m) => m.user_id === userId) : [];
  if (o.isAdminOrHead && memberships.length === 0) notFound();
  const person = one(profile);
  return {
    id: person.id,
    name: person.full_name ?? person.email ?? "Unnamed",
    email: person.email ?? null,
    roles: memberships.map((m) => ({ role: m.role, status: m.status })),
    classSubjects: (subjects ? rows(subjects) : [])
      .sort(
        (a, b) =>
          a.classes.name.localeCompare(b.classes.name, "en", { numeric: true }) ||
          a.subjects.sort_order - b.subjects.sort_order,
      )
      .map((cs) => ({
        id: cs.id,
        classId: cs.class_id,
        className: cs.classes.name,
        subjectName: cs.subjects.name,
      })),
    classes: classes ? rows(classes) : [],
    owed: {
      classSubjects: owed.classSubjects.filter((cs) => cs.teacherId === userId),
      classes: owed.classes.filter((c) => c.classTeacherId === userId),
    },
  };
}

// Classes ------------------------------------------------------------------------------

export type ClassProfile = {
  id: string;
  name: string;
  yearId: string;
  yearLabel: string;
  levelName: string | null;
  classTeacher: { id: string; name: string } | null;
  teachers: {
    classSubjectId: string;
    subjectName: string;
    teacherId: string | null;
    teacherName: string | null;
  }[];
  terms: TermInfo[];
  term: TermInfo | null;
  learners: {
    id: string;
    name: string;
    number: string;
    stillInClass: boolean;
    status: string;
    average: number | null;
    position: number | null;
    grades: Record<string, string | null>;
  }[];
  reports: ReportCounts;
  owed: { classSubjects: ClassSubjectCompletion[]; classes: ClassCompletion[] };
};

/** A class's learners, teachers, results for a term and its reports by status. */
export async function loadClassProfile(
  o: Overseer,
  classId: string,
  wantedTerm: string | undefined,
): Promise<ClassProfile> {
  if (!isUuid(classId)) notFound();
  const supabase = await createClient();
  const [klassResult, subjectsResult] = await Promise.all([
    supabase
      .from("classes")
      .select(
        "id, name, academic_year_id, class_teacher_id, grade_levels(name), academic_years!inner(label), schools!inner(timezone), class_teacher:profiles!classes_class_teacher_id_fkey(full_name)",
      )
      .eq("id", classId)
      .eq("school_id", o.schoolId)
      .maybeSingle(),
    supabase
      .from("class_subjects")
      .select(
        "id, teacher_id, subjects!inner(name, sort_order), teacher:profiles!class_subjects_teacher_id_fkey(full_name)",
      )
      .eq("class_id", classId)
      .eq("school_id", o.schoolId),
  ]);
  const klass = one(klassResult);
  const subjects = rows(subjectsResult).sort(
    (a, b) => a.subjects.sort_order - b.subjects.sort_order,
  );
  // A hod opens only a class they teach in or are class teacher of (D23).
  if (
    !o.isAdminOrHead &&
    klass.class_teacher_id !== o.userId &&
    !subjects.some((s) => s.teacher_id === o.userId)
  )
    notFound();

  const termRows: TermInfo[] = rows(
    await supabase
      .from("terms")
      .select("id, name, kind, starts_on, ends_on")
      .eq("academic_year_id", klass.academic_year_id)
      .order("starts_on"),
  ).map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
  }));
  const term =
    termRows.find((t) => t.id === wantedTerm) ??
    pickCurrentTerm(termRows, todayIn(klass.schools.timezone ?? "Africa/Harare"));

  const [enrolments, results, positions, reports, owed] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id, status, learners!inner(id, first_name, last_name, learner_number)")
      .eq("class_id", classId),
    term ? supabase.rpc("subject_results", { p_class_id: classId, p_term_id: term.id }) : null,
    term ? supabase.rpc("class_positions", { p_class_id: classId, p_term_id: term.id }) : null,
    term
      ? supabase
          .from("reports")
          .select("status, enrolments!inner(class_id)")
          .eq("term_id", term.id)
          .eq("enrolments.class_id", classId)
      : null,
    term ? loadCompletion(term.id) : Promise.resolve({ classSubjects: [], classes: [] }),
  ]);

  const gradeOf = new Map<string, Record<string, string | null>>();
  for (const r of results ? rows(results) : []) {
    const g = gradeOf.get(r.enrolment_id) ?? {};
    g[r.class_subject_id] = r.result_status === "complete" ? (r.grade ?? null) : null;
    gradeOf.set(r.enrolment_id, g);
  }
  const positionOf = new Map((positions ? rows(positions) : []).map((p) => [p.enrolment_id, p]));

  return {
    id: klass.id,
    name: klass.name,
    yearId: klass.academic_year_id,
    yearLabel: klass.academic_years.label,
    levelName: klass.grade_levels?.name ?? null,
    classTeacher:
      klass.class_teacher_id && klass.class_teacher
        ? { id: klass.class_teacher_id, name: klass.class_teacher.full_name ?? "Unnamed" }
        : null,
    teachers: subjects.map((s) => ({
      classSubjectId: s.id,
      subjectName: s.subjects.name,
      teacherId: s.teacher_id ?? null,
      teacherName: s.teacher?.full_name ?? null,
    })),
    terms: termRows,
    term,
    learners: rows(enrolments)
      .map((e) => {
        const p = positionOf.get(e.id);
        return {
          id: e.learners.id,
          name: `${e.learners.first_name} ${e.learners.last_name}`,
          number: e.learners.learner_number,
          stillInClass: isStillInClass(e.status),
          status: e.status,
          average: p?.average == null ? null : Number(p.average),
          position: p?.position ?? null,
          grades: gradeOf.get(e.id) ?? {},
        };
      })
      .sort(
        (a, b) => Number(b.stillInClass) - Number(a.stillInClass) || a.name.localeCompare(b.name),
      ),
    reports: countReports(reports ? rows(reports) : []),
    owed: {
      classSubjects: owed.classSubjects.filter((cs) => cs.classId === classId),
      classes: owed.classes.filter((c) => c.classId === classId),
    },
  };
}
