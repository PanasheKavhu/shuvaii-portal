"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schoolAdminContext } from "@/lib/auth/viewer";
import { SCALE_TEMPLATES, describeBandProblem, parseBands } from "@/lib/setup/bands";
import { parseTerm, parseYear, termClashes, type TermDraft } from "@/lib/setup/calendar";
import { describeGap } from "@/lib/setup/gaps";
import {
  LEVEL_STAGES,
  isUuid,
  parseClass,
  parseGradeLevel,
  parseOptionalTeacher,
  parseSubject,
} from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, notAllowed, saved, type FormState } from "../../platform/form-state";
import { getYear, listTerms, loadYearSetup } from "./data";

/**
 * School admin setup actions (US-2.1 to US-2.4). Each one checks the caller
 * is a school admin of their active school and validates input with the
 * pure parsers in src/lib/setup; writes go through the user-scoped client,
 * so RLS and the database checks (D20, D21, D22) apply as well.
 */

const NOT_ALLOWED = notAllowed("a school admin");

/** A readable message for a database refusal. */
function dbMessage(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") return `That ${what} already exists. Use a different name or code.`;
  if (error.code === "23503") return `That ${what} is still in use, so it cannot be removed.`;
  if (error.code === "23514" || error.code === "P0001") return capitalise(error.message);
  if (error.code === "42501") return NOT_ALLOWED.message!;
  return `Could not save the ${what}. Please try again.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith(".") ? "" : ".");
}

function setupPath(yearId: string, rest = ""): string {
  return `/admin/setup/${yearId}${rest}`;
}

// Years and terms -----------------------------------------------------------------

const TERM_FIELDS = ["name", "kind", "startsOn", "endsOn", "marksDeadline", "status"] as const;

function readTerm(formData: FormData, prefix = "") {
  return Object.fromEntries(TERM_FIELDS.map((f) => [f, formData.get(`${prefix}${f}`)])) as Record<
    (typeof TERM_FIELDS)[number],
    unknown
  >;
}

/** US-2.1: a new year with its proposed (and edited) terms. */
export async function createYear(_prev: FormState, formData: FormData): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId) return NOT_ALLOWED;
  const year = parseYear({
    label: formData.get("label"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
  });
  if (!year.ok) return failed("Check the year's details.", year.errors);

  const count = Math.min(Number(formData.get("termCount")) || 0, 12);
  const terms: TermDraft[] = [];
  for (let i = 0; i < count; i++) {
    const parsed = parseTerm(readTerm(formData, `term-${i}-`), year.value);
    if (!parsed.ok) {
      const first = Object.values(parsed.errors)[0];
      return failed(`Period ${i + 1}: ${first}`);
    }
    terms.push(parsed.value);
  }
  const clashes = termClashes(terms);
  if (clashes.overlaps.length) {
    const { first, second } = clashes.overlaps[0]!;
    return failed(`${first} and ${second} overlap. Change their dates.`);
  }
  if (clashes.duplicateNames.length)
    return failed(`${clashes.duplicateNames[0]} is used twice. Give each period its own name.`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .insert({
      school_id: schoolId,
      label: year.value.label,
      starts_on: year.value.startsOn,
      ends_on: year.value.endsOn,
    })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505"
      ? failed("Check the year's details.", { label: "A year with this label already exists." })
      : failed(dbMessage(error, "year"));
  }

  if (terms.length) {
    const { error: termError } = await supabase.from("terms").insert(
      terms.map((t) => ({
        school_id: schoolId,
        academic_year_id: data.id,
        name: t.name,
        kind: t.kind,
        starts_on: t.startsOn,
        ends_on: t.endsOn,
        marks_deadline: t.marksDeadline,
        status: t.status,
      })),
    );
    if (termError) {
      // Leave nothing half made: the year has no other rows yet.
      await supabase.from("academic_years").delete().eq("id", data.id).eq("school_id", schoolId);
      return failed(dbMessage(termError, "term"));
    }
  }

  revalidatePath("/admin/setup");
  redirect(setupPath(data.id));
}

/** Checks one term against its year and the year's other terms. */
async function checkTermInYear(
  schoolId: string,
  yearId: string,
  termId: string | null,
  formData: FormData,
): Promise<{ ok: true; value: TermDraft } | { ok: false; state: FormState }> {
  const year = await getYear(schoolId, yearId);
  const parsed = parseTerm(readTerm(formData), year);
  if (!parsed.ok)
    return { ok: false, state: failed("Check the highlighted details.", parsed.errors) };
  const others = (await listTerms(yearId)).filter((t) => t.id !== termId);
  const clashes = termClashes([...others, parsed.value]);
  const clash = clashes.overlaps.find(
    (c) => c.first === parsed.value.name || c.second === parsed.value.name,
  );
  if (clash) {
    const other = clash.first === parsed.value.name ? clash.second : clash.first;
    return { ok: false, state: failed(`These dates overlap ${other}.`) };
  }
  if (clashes.duplicateNames.length)
    return { ok: false, state: failed("Another period in this year has that name.") };
  return { ok: true, value: parsed.value };
}

function termRow(t: TermDraft) {
  return {
    name: t.name,
    kind: t.kind,
    starts_on: t.startsOn,
    ends_on: t.endsOn,
    marks_deadline: t.marksDeadline,
    status: t.status,
  };
}

export async function addTerm(
  yearId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId)) return NOT_ALLOWED;
  const checked = await checkTermInYear(schoolId, yearId, null, formData);
  if (!checked.ok) return checked.state;
  const supabase = await createClient();
  const { error } = await supabase
    .from("terms")
    .insert({ school_id: schoolId, academic_year_id: yearId, ...termRow(checked.value) });
  if (error) return failed(dbMessage(error, "term"));
  revalidatePath(setupPath(yearId), "layout");
  return saved(`${checked.value.name} added.`);
}

/** US-2.4: dates, status and marks deadline. Unlocking rules come in Phase 3. */
export async function saveTerm(
  yearId: string,
  termId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || !isUuid(termId)) return NOT_ALLOWED;
  const checked = await checkTermInYear(schoolId, yearId, termId, formData);
  if (!checked.ok) return checked.state;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("terms")
    .update(termRow(checked.value))
    .eq("id", termId)
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .select("id");
  if (error) return failed(dbMessage(error, "term"));
  if (data.length !== 1) return NOT_ALLOWED;
  revalidatePath(setupPath(yearId), "layout");
  return saved(`${checked.value.name} saved.`);
}

// Grading scales ----------------------------------------------------------------

export async function createScale(
  yearId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId)) return NOT_ALLOWED;
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const stage = formData.get("stage");
  const template = formData.get("template");
  const errors: FormState["errors"] = {};
  if (name.length < 1 || name.length > 120) errors.name = "Enter a name (up to 120 characters).";
  if (!LEVEL_STAGES.includes(stage as never)) errors.stage = "Choose a stage.";
  if (Object.keys(errors).length) return failed("Check the scale's details.", errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_scales")
    .insert({ school_id: schoolId, name, stage: stage as (typeof LEVEL_STAGES)[number] })
    .select("id")
    .single();
  if (error) return failed(dbMessage(error, "grading scale"));

  const bands =
    template === "o_level" || template === "primary" ? SCALE_TEMPLATES[template].bands : [];
  if (bands.length) {
    const { error: bandError } = await supabase.rpc("save_grading_bands", {
      p_scale_id: data.id,
      p_bands: bands.map((b) => ({
        grade: b.grade,
        min_mark: b.minMark,
        max_mark: b.maxMark,
        remark: b.remark,
      })),
    });
    if (bandError) return failed(dbMessage(bandError, "grading bands"));
  }
  revalidatePath(setupPath(yearId), "layout");
  redirect(setupPath(yearId, `/grading/${data.id}`));
}

/**
 * US-2.3 band editor save. The bands are checked here (gap, overlap, out of
 * range) and again by the database for a default scale (D21).
 */
export async function saveBands(
  yearId: string,
  scaleId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || !isUuid(scaleId)) return NOT_ALLOWED;
  const grades = formData.getAll("grade").map(String);
  const mins = formData.getAll("minMark").map(String);
  const maxes = formData.getAll("maxMark").map(String);
  const remarks = formData.getAll("remark").map(String);
  const parsed = parseBands(
    grades.map((grade, i) => ({
      grade,
      minMark: mins[i] ?? "",
      maxMark: maxes[i] ?? "",
      remark: remarks[i] ?? "",
    })),
  );
  if (!parsed.ok) return failed(`Not saved. ${parsed.problems.map(describeBandProblem).join(" ")}`);

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from("grading_scales")
    .select("id, stage, is_default")
    .eq("id", scaleId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!scale) return NOT_ALLOWED;

  const { error } = await supabase.rpc("save_grading_bands", {
    p_scale_id: scaleId,
    p_bands: parsed.value.map((b) => ({
      grade: b.grade,
      min_mark: b.minMark,
      max_mark: b.maxMark,
      remark: b.remark,
    })),
  });
  if (error) return failed(dbMessage(error, "grading bands"));

  if (formData.get("isDefault") === "on" && !scale.is_default) {
    await supabase
      .from("grading_scales")
      .update({ is_default: false })
      .eq("school_id", schoolId)
      .eq("stage", scale.stage)
      .eq("is_default", true);
    const { error: defaultError } = await supabase
      .from("grading_scales")
      .update({ is_default: true })
      .eq("id", scaleId)
      .eq("school_id", schoolId);
    if (defaultError) return failed(dbMessage(defaultError, "grading scale"));
  }
  revalidatePath(setupPath(yearId), "layout");
  return saved("Bands saved. They cover 0 to 100 with no gaps or overlaps.");
}

// Grade levels and subjects ----------------------------------------------------------

export async function saveLevel(
  yearId: string,
  levelId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || (levelId !== null && !isUuid(levelId))) return NOT_ALLOWED;
  const parsed = parseGradeLevel({
    name: formData.get("name"),
    stage: formData.get("stage"),
    sortOrder: formData.get("sortOrder"),
    gradingScaleId: formData.get("gradingScaleId"),
  });
  if (!parsed.ok) return failed("Check the grade level's details.", parsed.errors);
  const row = {
    name: parsed.value.name,
    stage: parsed.value.stage,
    sort_order: parsed.value.sortOrder,
    grading_scale_id: parsed.value.gradingScaleId,
  };
  const supabase = await createClient();
  const { error } = levelId
    ? await supabase.from("grade_levels").update(row).eq("id", levelId).eq("school_id", schoolId)
    : await supabase.from("grade_levels").insert({ school_id: schoolId, ...row });
  if (error) return failed(dbMessage(error, "grade level"));
  revalidatePath(setupPath(yearId), "layout");
  return saved(levelId ? `${row.name} saved.` : `${row.name} added.`);
}

export async function saveSubject(
  yearId: string,
  subjectId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || (subjectId !== null && !isUuid(subjectId)))
    return NOT_ALLOWED;
  const parsed = parseSubject({
    code: formData.get("code"),
    name: formData.get("name"),
    stageScope: formData.get("stageScope"),
    isCore: formData.get("isCore"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.ok) return failed("Check the subject's details.", parsed.errors);
  const row = {
    code: parsed.value.code,
    name: parsed.value.name,
    stage_scope: parsed.value.stageScope,
    is_core: parsed.value.isCore,
    sort_order: parsed.value.sortOrder,
  };
  const supabase = await createClient();
  const { error } = subjectId
    ? await supabase.from("subjects").update(row).eq("id", subjectId).eq("school_id", schoolId)
    : await supabase.from("subjects").insert({ school_id: schoolId, ...row });
  if (error) return failed(dbMessage(error, "subject"));
  revalidatePath(setupPath(yearId), "layout");
  return saved(subjectId ? `${row.name} saved.` : `${row.name} added.`);
}

// Classes and class subjects --------------------------------------------------------

/** US-2.1 and US-2.2: a class, its grade level and its class teacher. */
export async function saveClass(
  yearId: string,
  classId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || (classId !== null && !isUuid(classId))) return NOT_ALLOWED;
  const parsed = parseClass({
    name: formData.get("name"),
    gradeLevelId: formData.get("gradeLevelId"),
    classTeacherId: formData.get("classTeacherId"),
  });
  if (!parsed.ok) return failed("Check the class's details.", parsed.errors);
  const row = {
    name: parsed.value.name,
    grade_level_id: parsed.value.gradeLevelId,
    class_teacher_id: parsed.value.classTeacherId,
  };
  const supabase = await createClient();
  const { error } = classId
    ? await supabase
        .from("classes")
        .update(row)
        .eq("id", classId)
        .eq("academic_year_id", yearId)
        .eq("school_id", schoolId)
    : await supabase
        .from("classes")
        .insert({ school_id: schoolId, academic_year_id: yearId, ...row });
  if (error) return failed(dbMessage(error, "class"));
  revalidatePath(setupPath(yearId), "layout");
  return saved(classId ? `${row.name} saved.` : `${row.name} added.`);
}

/** Adds the ticked subjects to a class, with one teacher for all of them or none yet. */
export async function addClassSubjects(
  yearId: string,
  classId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || !isUuid(classId)) return NOT_ALLOWED;
  const subjectIds = formData.getAll("subjectId").filter(isUuid);
  if (subjectIds.length === 0) return failed("Tick at least one subject to add.");
  const teacher = parseOptionalTeacher(formData.get("teacherId"));
  if (!teacher.ok) return failed("Choose a teacher from the list.");
  const supabase = await createClient();
  const { error } = await supabase.from("class_subjects").insert(
    subjectIds.map((subjectId) => ({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacher.value,
    })),
  );
  if (error) return failed(dbMessage(error, "class subject"));
  revalidatePath(setupPath(yearId), "layout");
  return saved(subjectIds.length === 1 ? "Subject added." : `${subjectIds.length} subjects added.`);
}

/** US-2.2: one teacher per class subject; a teacher may take many. */
export async function setSubjectTeacher(
  yearId: string,
  classSubjectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || !isUuid(classSubjectId)) return NOT_ALLOWED;
  const teacher = parseOptionalTeacher(formData.get("teacherId"));
  if (!teacher.ok) return failed("Choose a teacher from the list.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_subjects")
    .update({ teacher_id: teacher.value })
    .eq("id", classSubjectId)
    .eq("school_id", schoolId)
    .select("id");
  if (error) return failed(dbMessage(error, "class subject"));
  if (data.length !== 1) return NOT_ALLOWED;
  revalidatePath(setupPath(yearId), "layout");
  return saved(teacher.value ? "Teacher saved." : "Teacher removed.");
}

export async function removeClassSubject(
  yearId: string,
  classSubjectId: string,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId) || !isUuid(classSubjectId)) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_subjects")
    .delete()
    .eq("id", classSubjectId)
    .eq("school_id", schoolId);
  if (error) return failed(dbMessage(error, "class subject"));
  revalidatePath(setupPath(yearId), "layout");
  return saved("Subject removed from the class.");
}

// Finishing ----------------------------------------------------------------------

/**
 * US-2.1: finishing is refused while any gap remains; the database refuses
 * the teacher gaps again (D22). The first finished year becomes current.
 */
export async function finishSetup(yearId: string): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId)) return NOT_ALLOWED;
  const year = await getYear(schoolId, yearId);
  const { gaps } = await loadYearSetup(schoolId, yearId);
  if (gaps.length) {
    return failed(
      `Setup cannot be finished yet. ${gaps.length === 1 ? "1 gap needs" : `${gaps.length} gaps need`} fixing: ${gaps.map(describeGap).join(" ")}`,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("academic_years")
    .update({ setup_completed_at: new Date().toISOString() })
    .eq("id", yearId)
    .eq("school_id", schoolId);
  if (error) return failed(dbMessage(error, "year"));

  const { data: current } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_current", true);
  if (!current?.length) await supabase.rpc("set_current_academic_year", { p_year_id: yearId });

  revalidatePath("/admin/setup", "layout");
  return saved(`Setup for ${year.label} is finished.`);
}

export async function makeCurrentYear(yearId: string): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isUuid(yearId)) return NOT_ALLOWED;
  // The year must be one of the active school's, not just any the admin can write.
  await getYear(schoolId, yearId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_current_academic_year", { p_year_id: yearId });
  if (error) return failed(dbMessage(error, "year"));
  revalidatePath("/admin/setup", "layout");
  return saved("This is now the current year.");
}
