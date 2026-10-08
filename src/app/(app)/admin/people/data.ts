import "server-only";

import { notFound } from "next/navigation";
import type { StaffRole } from "@/lib/people/fields";
import type { ExistingGuardian, ImportClass } from "@/lib/people/learner-import";
import type { LearnerStatus, MembershipStatus } from "@/lib/people/person-input";
import { searchWords } from "@/lib/people/person-input";
import type { ExistingStaff } from "@/lib/people/staff-import";
import { isUuid, type LevelStage } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Reads for /admin/people (SPEC US-3.1 to US-3.4). Everything goes through
 * the user-scoped client, so RLS limits it to the active school (D23); the
 * staff list comes from public.school_staff() (D24).
 */

export { requireSchoolAdmin } from "../setup/data";

/** A query's rows, or a thrown error; a failed read must not look like "no one". */
function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  if (result.error) {
    console.error("people read failed", result.error.code);
    throw new Error("Could not load people. Please try again.");
  }
  return result.data ?? [];
}

export type YearRef = { id: string; label: string };

/** The school's current year, or its latest if none is marked current. */
export async function currentYear(schoolId: string): Promise<YearRef | null> {
  const supabase = await createClient();
  const years = rows(
    await supabase
      .from("academic_years")
      .select("id, label, is_current, starts_on")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
  );
  const year = years.find((y) => y.is_current) ?? years[0];
  return year ? { id: year.id, label: year.label } : null;
}

export type ClassOption = ImportClass & { stage: LevelStage };

/** A year's classes with their level's stage, by name. */
export async function listYearClasses(yearId: string): Promise<ClassOption[]> {
  const supabase = await createClient();
  const [classes, levels] = await Promise.all([
    supabase.from("classes").select("id, name, grade_level_id").eq("academic_year_id", yearId),
    supabase.from("grade_levels").select("id, stage"),
  ]).then(([c, l]) => [rows(c), rows(l)] as const);
  const stage = new Map(levels.map((l) => [l.id, l.stage]));
  return classes
    .map((c) => ({ id: c.id, name: c.name, stage: stage.get(c.grade_level_id) ?? "o_level" }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function isPrimaryStage(stage: LevelStage): boolean {
  return stage === "ecd" || stage === "primary";
}

// Learners ---------------------------------------------------------------------------

export type LearnerListRow = {
  id: string;
  learnerNumber: string;
  name: string;
  status: LearnerStatus;
  className: string | null;
};

export const LEARNER_PAGE_SIZE = 100;

export async function searchLearners(input: {
  schoolId: string;
  yearId: string | null;
  query: string;
  classId: string | null;
  status: LearnerStatus | "all";
}): Promise<{ learners: LearnerListRow[]; total: number }> {
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (input.classId && input.yearId) {
    const enrolled = rows(
      await supabase
        .from("enrolments")
        .select("learner_id")
        .eq("class_id", input.classId)
        .eq("academic_year_id", input.yearId),
    );
    ids = enrolled.map((e) => e.learner_id);
    if (ids.length === 0) return { learners: [], total: 0 };
  }

  let query = supabase
    .from("learners")
    .select("id, learner_number, first_name, last_name, status", { count: "exact" })
    .eq("school_id", input.schoolId);
  if (input.status !== "all") query = query.eq("status", input.status);
  for (const word of searchWords(input.query)) {
    query = query.or(
      `first_name.ilike.*${word}*,last_name.ilike.*${word}*,learner_number.ilike.*${word}*`,
    );
  }
  if (ids) query = query.in("id", ids);
  const result = await query
    .order("last_name")
    .order("first_name")
    .order("learner_number")
    .limit(LEARNER_PAGE_SIZE);
  const learners = rows(result);

  const classNames = new Map<string, string>();
  if (input.yearId && learners.length) {
    const enrolments = rows(
      await supabase
        .from("enrolments")
        .select("learner_id, class_id")
        .eq("academic_year_id", input.yearId)
        .in(
          "learner_id",
          learners.map((l) => l.id),
        ),
    );
    const classes = await listYearClasses(input.yearId);
    const name = new Map(classes.map((c) => [c.id, c.name]));
    for (const e of enrolments) classNames.set(e.learner_id, name.get(e.class_id) ?? "");
  }

  return {
    total: result.count ?? learners.length,
    learners: learners.map((l) => ({
      id: l.id,
      learnerNumber: l.learner_number,
      name: `${l.last_name}, ${l.first_name}`,
      status: l.status,
      className: classNames.get(l.id) ?? null,
    })),
  };
}

export type GuardianOnLearner = {
  linkId: string;
  guardianId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  isPrimary: boolean;
  /** Whether a parent has claimed this guardian record (US-1.3). */
  hasAccount: boolean;
  /** When the latest unused parent code for this guardian expires, if one is waiting. */
  codeExpiresAt: string | null;
  /** Other learners this guardian is linked to (siblings). */
  otherLearners: { id: string; name: string }[];
};

export type LearnerDetail = {
  id: string;
  learnerNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: "F" | "M" | null;
  admissionDate: string | null;
  status: LearnerStatus;
  /** Whether the learner has their own sign in (US-1.2). */
  hasLogin: boolean;
  enrolment: {
    id: string;
    classId: string;
    className: string;
    stage: LevelStage;
    subjects: { classSubjectId: string; name: string; chosen: boolean }[];
  } | null;
  guardians: GuardianOnLearner[];
};

/** One learner of the active school with this year's class, subjects and guardians, or 404. */
export async function getLearner(id: string, yearId: string | null): Promise<LearnerDetail> {
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const learner = await supabase
    .from("learners")
    .select(
      "id, learner_number, first_name, last_name, date_of_birth, sex, admission_date, status, user_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (learner.error) rows({ data: null, error: learner.error });
  if (!learner.data) notFound();
  const l = learner.data;

  let enrolment: LearnerDetail["enrolment"] = null;
  if (yearId) {
    const found = rows(
      await supabase
        .from("enrolments")
        .select("id, class_id")
        .eq("learner_id", id)
        .eq("academic_year_id", yearId),
    )[0];
    if (found) {
      const [classes, offered, chosen, subjects] = await Promise.all([
        listYearClasses(yearId),
        supabase.from("class_subjects").select("id, subject_id").eq("class_id", found.class_id),
        supabase.from("enrolment_subjects").select("class_subject_id").eq("enrolment_id", found.id),
        supabase.from("subjects").select("id, name, sort_order"),
      ]);
      const klass = classes.find((c) => c.id === found.class_id);
      const subjectRows = rows(subjects);
      const order = new Map(subjectRows.map((s) => [s.id, s.sort_order]));
      const name = new Map(subjectRows.map((s) => [s.id, s.name]));
      const picked = new Set(rows(chosen).map((c) => c.class_subject_id));
      enrolment = {
        id: found.id,
        classId: found.class_id,
        className: klass?.name ?? "",
        stage: klass?.stage ?? "o_level",
        subjects: rows(offered)
          .sort(
            (a, b) =>
              (order.get(a.subject_id) ?? 0) - (order.get(b.subject_id) ?? 0) ||
              (name.get(a.subject_id) ?? "").localeCompare(name.get(b.subject_id) ?? ""),
          )
          .map((cs) => ({
            classSubjectId: cs.id,
            name: name.get(cs.subject_id) ?? "Subject",
            chosen: picked.has(cs.id),
          })),
      };
    }
  }

  const links = rows(
    await supabase
      .from("guardian_links")
      .select("id, guardian_id, relationship, is_primary")
      .eq("learner_id", id)
      .order("is_primary", { ascending: false }),
  );
  let guardians: GuardianOnLearner[] = [];
  if (links.length) {
    const guardianIds = links.map((g) => g.guardian_id);
    const [people, siblingLinks, codes] = await Promise.all([
      supabase
        .from("guardians")
        .select("id, full_name, phone, email, user_id")
        .in("id", guardianIds),
      supabase
        .from("guardian_links")
        .select("guardian_id, learner_id")
        .in("guardian_id", guardianIds)
        .neq("learner_id", id),
      supabase
        .from("invites")
        .select("guardian_id, expires_at")
        .in("guardian_id", guardianIds)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString()),
    ]);
    const codeExpiry = new Map<string, string>();
    for (const c of rows(codes)) {
      if (!c.guardian_id) continue;
      const known = codeExpiry.get(c.guardian_id);
      if (!known || c.expires_at > known) codeExpiry.set(c.guardian_id, c.expires_at);
    }
    const siblings = rows(siblingLinks);
    const siblingNames = new Map<string, string>();
    if (siblings.length) {
      const named = rows(
        await supabase
          .from("learners")
          .select("id, first_name, last_name")
          .in(
            "id",
            siblings.map((s) => s.learner_id),
          ),
      );
      for (const s of named) siblingNames.set(s.id, `${s.first_name} ${s.last_name}`);
    }
    const byId = new Map(rows(people).map((g) => [g.id, g]));
    guardians = links.map((link) => {
      const g = byId.get(link.guardian_id);
      return {
        linkId: link.id,
        guardianId: link.guardian_id,
        fullName: g?.full_name ?? "",
        phone: g?.phone ?? null,
        email: g?.email ?? null,
        relationship: link.relationship,
        isPrimary: link.is_primary,
        hasAccount: Boolean(g?.user_id),
        codeExpiresAt: codeExpiry.get(link.guardian_id) ?? null,
        otherLearners: siblings
          .filter((s) => s.guardian_id === link.guardian_id)
          .map((s) => ({ id: s.learner_id, name: siblingNames.get(s.learner_id) ?? "" })),
      };
    });
  }

  return {
    id: l.id,
    learnerNumber: l.learner_number,
    firstName: l.first_name,
    lastName: l.last_name,
    dateOfBirth: l.date_of_birth,
    sex: l.sex,
    admissionDate: l.admission_date,
    status: l.status,
    hasLogin: l.user_id !== null,
    enrolment,
    guardians,
  };
}

/** The school's guardians, for matching by phone or email. */
export async function listGuardians(schoolId: string): Promise<ExistingGuardian[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("guardians")
      .select("id, full_name, phone, email")
      .eq("school_id", schoolId)
      .limit(20000),
  );
  return data.map((g) => ({ id: g.id, fullName: g.full_name, phone: g.phone, email: g.email }));
}

/** Every learner number used in the school, for the import's uniqueness check. */
export async function listLearnerNumbers(schoolId: string): Promise<string[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase.from("learners").select("learner_number").eq("school_id", schoolId).limit(20000),
  );
  return data.map((l) => l.learner_number);
}

// Staff -------------------------------------------------------------------------------

export type StaffMembership = { id: string; role: StaffRole; status: MembershipStatus };
export type StaffPerson = {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  memberships: StaffMembership[];
};

export async function listStaff(schoolId: string): Promise<StaffPerson[]> {
  const supabase = await createClient();
  const data = rows(await supabase.rpc("school_staff", { p_school_id: schoolId }));
  const people = new Map<string, StaffPerson>();
  for (const m of data) {
    const person = people.get(m.user_id) ?? {
      userId: m.user_id,
      fullName: m.full_name ?? m.email ?? "Unnamed",
      email: m.email ?? "",
      phone: m.phone,
      memberships: [],
    };
    person.memberships.push({ id: m.membership_id, role: m.role as StaffRole, status: m.status });
    people.set(m.user_id, person);
  }
  return [...people.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function existingStaffFor(staff: readonly StaffPerson[]): ExistingStaff[] {
  return staff.flatMap((p) =>
    p.memberships.map((m) => ({ email: p.email, role: m.role, status: m.status })),
  );
}

export async function getStaffPerson(schoolId: string, userId: string): Promise<StaffPerson> {
  if (!isUuid(userId)) notFound();
  const person = (await listStaff(schoolId)).find((p) => p.userId === userId);
  if (!person) notFound();
  return person;
}

/** A person's status in the school, summed over their roles. */
export function personStatus(person: StaffPerson): MembershipStatus {
  const statuses = person.memberships.map((m) => m.status);
  if (statuses.includes("active")) return "active";
  if (statuses.includes("invited")) return "invited";
  return "disabled";
}

// Imports -----------------------------------------------------------------------------

export type ImportReport = {
  fileName?: string;
  errors?: { row: number; message: string }[];
  summary?: Json;
  committed?: Json;
  notInvited?: string[];
};

export type ImportJobRow = {
  id: string;
  kind: "staff" | "learners" | "marks";
  status: "validated" | "committed" | "failed";
  filePath: string | null;
  report: ImportReport;
  createdAt: string;
};

function toJob(j: {
  id: string;
  kind: ImportJobRow["kind"];
  status: ImportJobRow["status"];
  file_path: string | null;
  error_report: Json;
  created_at: string;
}): ImportJobRow {
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    filePath: j.file_path,
    report: (j.error_report ?? {}) as ImportReport,
    createdAt: j.created_at,
  };
}

export async function listImportJobs(schoolId: string): Promise<ImportJobRow[]> {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("import_jobs")
      .select("id, kind, status, file_path, error_report, created_at")
      .eq("school_id", schoolId)
      .in("kind", ["staff", "learners"])
      .order("created_at", { ascending: false })
      .limit(10),
  );
  return data.map(toJob);
}

export async function getImportJob(schoolId: string, id: string): Promise<ImportJobRow> {
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const job = await supabase
    .from("import_jobs")
    .select("id, kind, status, file_path, error_report, created_at")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (job.error) rows({ data: null, error: job.error });
  if (!job.data) notFound();
  return toJob(job.data);
}
