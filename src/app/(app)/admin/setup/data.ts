import "server-only";

import { forbidden, notFound } from "next/navigation";
import { getActiveSchool, requireArea } from "@/lib/auth/viewer";
import { checkBands } from "@/lib/setup/bands";
import type { TermKind, TermStatus } from "@/lib/setup/calendar";
import { findSetupGaps, type SetupGap } from "@/lib/setup/gaps";
import { isUuid, type LevelStage, type SubjectScope } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the school admin setup area (US-2.1 to US-2.4). Everything goes
 * through the user-scoped client, so RLS limits it to the active school.
 */

/**
 * A query's rows, or a thrown error. A failed read must not look like an
 * empty list (which would show "no years" or a 404). Logs only the code.
 */
function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  if (result.error) {
    console.error("setup read failed", result.error.code);
    throw new Error("Could not load the school setup. Please try again.");
  }
  return result.data ?? [];
}

/** The active school of a school admin, or 403. Used by pages and actions. */
export async function requireSchoolAdmin(): Promise<{ schoolId: string; schoolName: string }> {
  const { viewer, school } = await requireArea("admin");
  const active = school ?? (await getActiveSchool(viewer));
  if (!active || !active.roles.includes("school_admin")) forbidden();
  return { schoolId: active.schoolId, schoolName: active.schoolName };
}

export type Teacher = { id: string; name: string; isHod: boolean };

/**
 * Active teaching staff of the school (teacher or hod memberships, D20),
 * one entry per person, by name. Heads of department teach too.
 */
export async function listTeachers(schoolId: string): Promise<Teacher[]> {
  const supabase = await createClient();
  const members = rows(
    await supabase
      .from("memberships")
      .select("user_id, role")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("role", ["teacher", "hod"]),
  );
  const ids = [...new Set((members ?? []).map((m) => m.user_id))];
  if (ids.length === 0) return [];
  const people = rows(await supabase.from("profiles").select("id, full_name, email").in("id", ids));
  const hods = new Set((members ?? []).filter((m) => m.role === "hod").map((m) => m.user_id));
  return (people ?? [])
    .map((p) => ({
      id: p.id,
      name: p.full_name ?? p.email ?? "Unnamed teacher",
      isHod: hods.has(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function teacherLabel(t: Teacher): string {
  return t.isHod ? `${t.name} (HOD)` : t.name;
}

export type YearRow = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  setupCompletedAt: string | null;
};

export async function listYears(schoolId: string): Promise<YearRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("academic_years")
      .select("id, label, starts_on, ends_on, is_current, setup_completed_at")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
  );
  return (data ?? []).map((y) => ({
    id: y.id,
    label: y.label,
    startsOn: y.starts_on,
    endsOn: y.ends_on,
    isCurrent: y.is_current,
    setupCompletedAt: y.setup_completed_at,
  }));
}

/** One year of the active school, or 404. */
export async function getYear(schoolId: string, yearId: string): Promise<YearRow> {
  if (!isUuid(yearId)) notFound();
  const year = (await listYears(schoolId)).find((y) => y.id === yearId);
  if (!year) notFound();
  return year;
}

export type TermRow = {
  id: string;
  name: string;
  kind: TermKind;
  startsOn: string;
  endsOn: string;
  marksDeadline: string | null;
  status: TermStatus;
};

export async function listTerms(yearId: string): Promise<TermRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("terms")
      .select("id, name, kind, starts_on, ends_on, marks_deadline, status")
      .eq("academic_year_id", yearId)
      .order("starts_on"),
  );
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
    marksDeadline: t.marks_deadline,
    status: t.status,
  }));
}

export type BandRow = { grade: string; minMark: number; maxMark: number; remark: string | null };
export type ScaleRow = {
  id: string;
  name: string;
  stage: LevelStage;
  isDefault: boolean;
  bands: BandRow[];
  complete: boolean;
};

export async function listScales(schoolId: string): Promise<ScaleRow[]> {
  const supabase = await createClient();
  const [scales, bands] = await Promise.all([
    supabase
      .from("grading_scales")
      .select("id, name, stage, is_default")
      .eq("school_id", schoolId)
      .order("name"),
    supabase
      .from("grading_bands")
      .select("scale_id, grade, min_mark, max_mark, remark")
      .eq("school_id", schoolId)
      .order("min_mark", { ascending: false }),
  ]).then(([s, b]) => [rows(s), rows(b)] as const);
  return (scales ?? []).map((s) => {
    const own = (bands ?? [])
      .filter((b) => b.scale_id === s.id)
      .map((b) => ({ grade: b.grade, minMark: b.min_mark, maxMark: b.max_mark, remark: b.remark }));
    return {
      id: s.id,
      name: s.name,
      stage: s.stage,
      isDefault: s.is_default,
      bands: own,
      complete: checkBands(own).length === 0,
    };
  });
}

export type LevelRow = {
  id: string;
  name: string;
  stage: LevelStage;
  sortOrder: number;
  gradingScaleId: string;
};

export async function listLevels(schoolId: string): Promise<LevelRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("grade_levels")
      .select("id, name, stage, sort_order, grading_scale_id")
      .eq("school_id", schoolId)
      .order("sort_order")
      .order("name"),
  );
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    stage: l.stage,
    sortOrder: l.sort_order,
    gradingScaleId: l.grading_scale_id,
  }));
}

export type SubjectRow = {
  id: string;
  code: string;
  name: string;
  stageScope: SubjectScope;
  isCore: boolean;
  sortOrder: number;
};

export async function listSubjects(schoolId: string): Promise<SubjectRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("subjects")
      .select("id, code, name, stage_scope, is_core, sort_order")
      .eq("school_id", schoolId)
      .order("sort_order")
      .order("name"),
  );
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    stageScope: s.stage_scope,
    isCore: s.is_core,
    sortOrder: s.sort_order,
  }));
}

export type ClassRow = {
  id: string;
  name: string;
  gradeLevelId: string;
  classTeacherId: string | null;
};

export async function listClasses(yearId: string): Promise<ClassRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("classes")
      .select("id, name, grade_level_id, class_teacher_id")
      .eq("academic_year_id", yearId),
  );
  return (data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevelId: c.grade_level_id,
      classTeacherId: c.class_teacher_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export type ClassSubjectRow = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
};

export async function listClassSubjects(classIds: string[]): Promise<ClassSubjectRow[]> {
  if (classIds.length === 0) return [];
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("class_subjects")
      .select("id, class_id, subject_id, teacher_id")
      .in("class_id", classIds),
  );
  return (data ?? []).map((cs) => ({
    id: cs.id,
    classId: cs.class_id,
    subjectId: cs.subject_id,
    teacherId: cs.teacher_id,
  }));
}

export type YearSetup = {
  terms: TermRow[];
  scales: ScaleRow[];
  levels: LevelRow[];
  subjects: SubjectRow[];
  classes: ClassRow[];
  classSubjects: ClassSubjectRow[];
  gaps: SetupGap[];
};

/** Everything the wizard hub needs for one year, with its gaps. */
export async function loadYearSetup(schoolId: string, yearId: string): Promise<YearSetup> {
  const [terms, scales, levels, subjects, classes] = await Promise.all([
    listTerms(yearId),
    listScales(schoolId),
    listLevels(schoolId),
    listSubjects(schoolId),
    listClasses(yearId),
  ]);
  const classSubjects = await listClassSubjects(classes.map((c) => c.id));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const scaleComplete = new Map(scales.map((s) => [s.id, s.complete]));
  const gaps = findSetupGaps({
    terms,
    classes,
    classSubjects: classSubjects.map((cs) => ({
      ...cs,
      subjectName: subjectName.get(cs.subjectId) ?? "A subject",
    })),
    gradeLevels: levels.map((l) => ({
      id: l.id,
      name: l.name,
      scaleComplete: scaleComplete.get(l.gradingScaleId) ?? false,
    })),
  });
  return { terms, scales, levels, subjects, classes, classSubjects, gaps };
}
