/**
 * Grade levels, subjects and classes: form parsing for the setup area
 * (SPEC US-2.1, US-2.2). Pure; the database repeats every rule.
 */

export const LEVEL_STAGES = ["ecd", "primary", "o_level", "a_level"] as const;
export type LevelStage = (typeof LEVEL_STAGES)[number];
export const LEVEL_STAGE_LABELS: Record<LevelStage, string> = {
  ecd: "ECD",
  primary: "Primary",
  o_level: "O-Level",
  a_level: "A-Level",
};

export const SUBJECT_SCOPES = ["primary", "secondary", "combined"] as const;
export type SubjectScope = (typeof SUBJECT_SCOPES)[number];
export const SUBJECT_SCOPE_LABELS: Record<SubjectScope, string> = {
  primary: "Primary",
  secondary: "Secondary",
  combined: "Primary and secondary",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

type Errors<T> = Partial<Record<keyof T, string>>;
export type Parse<T> = { ok: true; value: T } | { ok: false; errors: Errors<T> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function order(value: unknown): number | null {
  const s = text(value);
  if (s === "") return 0;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}

export type GradeLevelDraft = {
  name: string;
  stage: LevelStage;
  sortOrder: number;
  gradingScaleId: string;
};

export function parseGradeLevel(form: {
  name: unknown;
  stage: unknown;
  sortOrder: unknown;
  gradingScaleId: unknown;
}): Parse<GradeLevelDraft> {
  const name = text(form.name);
  const sortOrder = order(form.sortOrder);
  const errors: Errors<GradeLevelDraft> = {};
  if (name.length < 1 || name.length > 60)
    errors.name = "Enter a name such as Form 1 (up to 60 characters).";
  if (!isOneOf(LEVEL_STAGES, form.stage)) errors.stage = "Choose a stage.";
  if (sortOrder === null) errors.sortOrder = "Use a whole number from 0 to 999.";
  if (!isUuid(form.gradingScaleId))
    errors.gradingScaleId = "Choose the grading scale for this level.";
  if (
    Object.keys(errors).length ||
    !isOneOf(LEVEL_STAGES, form.stage) ||
    sortOrder === null ||
    !isUuid(form.gradingScaleId)
  )
    return { ok: false, errors };
  return {
    ok: true,
    value: { name, stage: form.stage, sortOrder, gradingScaleId: form.gradingScaleId },
  };
}

export type SubjectDraft = {
  code: string;
  name: string;
  stageScope: SubjectScope;
  isCore: boolean;
  sortOrder: number;
};

export function parseSubject(form: {
  code: unknown;
  name: unknown;
  stageScope: unknown;
  isCore: unknown;
  sortOrder: unknown;
}): Parse<SubjectDraft> {
  const code = text(form.code).toUpperCase();
  const name = text(form.name);
  const sortOrder = order(form.sortOrder);
  const errors: Errors<SubjectDraft> = {};
  if (!CODE_RE.test(code))
    errors.code = "Use 1 to 12 letters, numbers, hyphens or underscores, like MATH.";
  if (name.length < 1 || name.length > 80)
    errors.name = "Enter the subject's full name (up to 80 characters).";
  if (!isOneOf(SUBJECT_SCOPES, form.stageScope))
    errors.stageScope = "Choose where the subject is taught.";
  if (sortOrder === null) errors.sortOrder = "Use a whole number from 0 to 999.";
  if (Object.keys(errors).length || !isOneOf(SUBJECT_SCOPES, form.stageScope) || sortOrder === null)
    return { ok: false, errors };
  return {
    ok: true,
    value: {
      code,
      name,
      stageScope: form.stageScope,
      isCore: form.isCore === "on" || form.isCore === true,
      sortOrder,
    },
  };
}

export type ClassDraft = { name: string; gradeLevelId: string; classTeacherId: string | null };

export function parseClass(form: {
  name: unknown;
  gradeLevelId: unknown;
  classTeacherId: unknown;
}): Parse<ClassDraft> {
  const name = text(form.name);
  const teacher = text(form.classTeacherId);
  const errors: Errors<ClassDraft> = {};
  if (name.length < 1 || name.length > 60)
    errors.name = "Enter a class name such as 3 Blue (up to 60 characters).";
  if (!isUuid(form.gradeLevelId)) errors.gradeLevelId = "Choose the grade level.";
  if (teacher && !isUuid(teacher)) errors.classTeacherId = "Choose a teacher from the list.";
  if (Object.keys(errors).length || !isUuid(form.gradeLevelId)) return { ok: false, errors };
  return {
    ok: true,
    value: { name, gradeLevelId: form.gradeLevelId, classTeacherId: teacher || null },
  };
}

/** An optional teacher picked from a list: a uuid, or "" for "no teacher yet". */
export function parseOptionalTeacher(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  const v = text(value);
  if (v === "") return { ok: true, value: null };
  return isUuid(v) ? { ok: true, value: v } : { ok: false };
}
