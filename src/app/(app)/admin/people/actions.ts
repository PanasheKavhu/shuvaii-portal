"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  inviteLink,
} from "@/lib/auth/invite-code";
import { issueLearnerPin } from "@/lib/auth/learner-accounts";
import {
  findOrCreateAccounts,
  resendProblem,
  sendInviteEmail,
  unprovedMessage,
} from "@/lib/auth/staff-accounts";
import { getActiveSchool, getViewer } from "@/lib/auth/viewer";
import { STAFF_ROLE_LABELS, isStaffRole } from "@/lib/people/fields";
import {
  GuardianMatcher,
  planLearnerImport,
  summariseLearnerPlan,
  type GuardianPlan,
  type LearnerPlan,
} from "@/lib/people/learner-import";
import {
  parseGuardianForm,
  parseLearnerForm,
  parseStaffForm,
  parseStaffProfile,
  parseSubjectChoices,
  type LearnerStatus,
} from "@/lib/people/person-input";
import { planStaffImport, summariseStaffPlan } from "@/lib/people/staff-import";
import { readUpload, uploadContentType } from "@/lib/people/upload";
import { isUuid } from "@/lib/setup/structure";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "../../platform/form-state";
import type { SecretState } from "./secret-state";
import {
  currentYear,
  existingStaffFor,
  getImportJob,
  listGuardians,
  listLearnerNumbers,
  listStaff,
  listYearClasses,
  type ImportReport,
} from "./data";
import { sendStaffInvites } from "./staff-accounts";

/**
 * School admin actions for /admin/people (SPEC US-3.1 to US-3.4, D24).
 * Each one checks the caller is a school admin of their active school and
 * validates input with the pure parsers in src/lib/people; writes go
 * through the user-scoped client, so RLS (D23) and the database functions'
 * checks apply as well. Learners and guardians are never deleted; a leaver
 * gets a status, a staff member who leaves is disabled.
 */

const NOT_ALLOWED: FormState = {
  status: "error",
  message: "Only a school admin can do this.",
  errors: {},
};
const saved = (message: string): FormState => ({ status: "saved", message, errors: {} });
const failed = (message: string | null, errors: FormState["errors"] = {}): FormState => ({
  status: "error",
  message,
  errors,
});
const TRY_AGAIN = "Could not save. Please try again.";

async function adminContext(): Promise<{ schoolId: string; userId: string } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const school = await getActiveSchool(viewer);
  return school?.roles.includes("school_admin")
    ? { schoolId: school.schoolId, userId: viewer.userId }
    : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function learnerPath(id: string): string {
  return `/admin/people/learners/${id}`;
}

/** The JSON public.import_learners() expects (migration people_admin). */
function learnerJson(guardians: readonly GuardianPlan[], learners: readonly LearnerPlan[]) {
  return {
    p_guardians: guardians.map((g) => ({
      ref: g.ref,
      id: g.id,
      full_name: g.fullName,
      phone: g.phone,
      email: g.email,
    })) as Json,
    p_learners: learners.map((l) => ({
      learner_number: l.learnerNumber,
      first_name: l.firstName,
      last_name: l.lastName,
      date_of_birth: l.dateOfBirth,
      sex: l.sex,
      admission_date: l.admissionDate,
      class_id: l.classId || null,
      guardian_ref: l.guardianRef,
      relationship: l.relationship,
    })) as Json,
  };
}

function learnerFields(formData: FormData) {
  return {
    learnerNumber: formData.get("learnerNumber"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    dateOfBirth: formData.get("dateOfBirth"),
    sex: formData.get("sex"),
    admissionDate: formData.get("admissionDate"),
    status: formData.get("status") ?? undefined,
    classId: formData.get("classId"),
  };
}

function guardianFields(formData: FormData) {
  return {
    fullName: formData.get("guardianName"),
    phone: formData.get("guardianPhone"),
    email: formData.get("guardianEmail"),
    relationship: formData.get("relationship"),
    isPrimary: formData.get("isPrimary"),
  };
}

/** Guardian field errors under the form's own field names. */
function guardianErrors(errors: Record<string, string | undefined>): FormState["errors"] {
  return {
    guardianName: errors.fullName,
    guardianPhone: errors.phone,
    guardianEmail: errors.email,
    relationship: errors.relationship,
  };
}

// Learners ----------------------------------------------------------------------------

/** US-3.3: add one learner, with this year's class and optionally a guardian. */
export async function addLearner(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx) return NOT_ALLOWED;
  const learner = parseLearnerForm(learnerFields(formData), today());
  if (!learner.ok) return failed("Check the learner's details.", learner.errors);

  const year = await currentYear(ctx.schoolId);
  const classes = year ? await listYearClasses(year.id) : [];
  const klass = classes.find((c) => c.id === learner.value.classId);
  if (learner.value.classId && !klass)
    return failed(null, { classId: "Choose one of this year's classes." });

  // A guardian is optional; if any of its fields is filled, it must be complete.
  const g = guardianFields(formData);
  const anyGuardian = [g.fullName, g.phone, g.email].some((v) => typeof v === "string" && v.trim());
  let guardians: GuardianPlan[] = [];
  let guardianRef: string | null = null;
  let relationship: string | null = null;
  if (anyGuardian) {
    const guardian = parseGuardianForm(g);
    if (!guardian.ok)
      return failed("Check the guardian's details.", guardianErrors(guardian.errors));
    const matcher = new GuardianMatcher(await listGuardians(ctx.schoolId));
    const matched = matcher.match(
      guardian.value.fullName,
      guardian.value.phone,
      guardian.value.email,
    );
    if ("error" in matched) return failed(matched.error);
    guardians = [matched.plan];
    guardianRef = matched.plan.ref;
    relationship = guardian.value.relationship;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_learners", {
    p_school_id: ctx.schoolId,
    ...learnerJson(guardians, [
      {
        row: 0,
        ...learner.value,
        classId: klass?.id ?? "",
        className: klass?.name ?? "",
        guardianRef,
        relationship,
      },
    ]),
  });
  if (error?.code === "23505")
    return failed(null, { learnerNumber: "That learner number is already used in the school." });
  if (error) return failed(TRY_AGAIN);

  const ids = (data as { learner_ids?: string[] } | null)?.learner_ids ?? [];
  revalidatePath("/admin/people/learners");
  redirect(ids[0] ? `${learnerPath(ids[0])}?added=1` : "/admin/people/learners");
}

/** US-3.3: edit a learner's details and status (a leaver is marked, never deleted). */
export async function updateLearner(
  learnerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId)) return NOT_ALLOWED;
  const parsed = parseLearnerForm({ ...learnerFields(formData), classId: "" }, today());
  if (!parsed.ok) return failed("Check the learner's details.", parsed.errors);
  const v = parsed.value;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learners")
    .update({
      learner_number: v.learnerNumber,
      first_name: v.firstName,
      last_name: v.lastName,
      date_of_birth: v.dateOfBirth,
      sex: v.sex,
      admission_date: v.admissionDate,
      status: v.status,
    })
    .eq("id", learnerId)
    .eq("school_id", ctx.schoolId)
    .select("id");
  if (error?.code === "23505")
    return failed(null, { learnerNumber: "That learner number is already used in the school." });
  if (error || data.length !== 1) return failed(TRY_AGAIN);

  // This year's enrolment follows the learner's status.
  const year = await currentYear(ctx.schoolId);
  if (year) {
    const enrolmentStatus: Record<LearnerStatus, "enrolled" | "left" | "graduated"> = {
      active: "enrolled",
      left: "left",
      graduated: "graduated",
    };
    await supabase
      .from("enrolments")
      .update({ status: enrolmentStatus[v.status] })
      .eq("learner_id", learnerId)
      .eq("academic_year_id", year.id);
  }

  revalidatePath(learnerPath(learnerId));
  revalidatePath("/admin/people/learners");
  return saved(`${v.firstName} ${v.lastName} saved.`);
}

/** US-3.3: put the learner in a class this year, or move them. */
export async function setLearnerClass(
  learnerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId)) return NOT_ALLOWED;
  const classId = formData.get("classId");
  const year = await currentYear(ctx.schoolId);
  const klass = year && (await listYearClasses(year.id)).find((c) => c.id === classId);
  if (!klass) return failed(null, { classId: "Choose one of this year's classes." });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_learner_class", {
    p_learner_id: learnerId,
    p_class_id: klass.id,
  });
  if (error) return failed(TRY_AGAIN);
  revalidatePath(learnerPath(learnerId));
  revalidatePath("/admin/people/learners");
  return saved(`Now in ${klass.name}.`);
}

/** US-3.4: the subjects a learner takes, from those offered to their class. */
export async function saveLearnerSubjects(
  learnerId: string,
  enrolmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId) || !isUuid(enrolmentId)) return NOT_ALLOWED;
  const choices = parseSubjectChoices(formData.getAll("classSubjectId"));
  if (!choices) return failed("Choose subjects from the list.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_learner_subjects", {
    p_enrolment_id: enrolmentId,
    p_class_subject_ids: choices,
  });
  if (error?.code === "23514") return failed("Only subjects offered to the class can be chosen.");
  if (error) return failed(TRY_AGAIN);
  revalidatePath(learnerPath(learnerId));
  return saved(choices.length === 1 ? "1 subject saved." : `${choices.length} subjects saved.`);
}

// Guardians ---------------------------------------------------------------------------

/** Makes one link the learner's primary guardian, clearing the others first. */
async function makePrimary(learnerId: string, linkId: string): Promise<boolean> {
  const supabase = await createClient();
  const cleared = await supabase
    .from("guardian_links")
    .update({ is_primary: false })
    .eq("learner_id", learnerId)
    .neq("id", linkId);
  if (cleared.error) return false;
  const set = await supabase.from("guardian_links").update({ is_primary: true }).eq("id", linkId);
  return !set.error;
}

/**
 * US-3.3 and US-3.2: link a guardian to a learner. A guardian with the same
 * phone or email as one the school already has is that guardian (siblings).
 */
export async function addGuardian(
  learnerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId)) return NOT_ALLOWED;
  const parsed = parseGuardianForm(guardianFields(formData));
  if (!parsed.ok) return failed("Check the guardian's details.", guardianErrors(parsed.errors));
  const g = parsed.value;

  const matched = new GuardianMatcher(await listGuardians(ctx.schoolId)).match(
    g.fullName,
    g.phone,
    g.email,
  );
  if ("error" in matched) return failed(matched.error);

  const supabase = await createClient();
  let guardianId = matched.plan.id;
  if (!guardianId) {
    const created = await supabase
      .from("guardians")
      .insert({ school_id: ctx.schoolId, full_name: g.fullName, phone: g.phone, email: g.email })
      .select("id")
      .single();
    if (created.error) return failed(TRY_AGAIN);
    guardianId = created.data.id;
  }

  const existingLinks = await supabase
    .from("guardian_links")
    .select("id")
    .eq("learner_id", learnerId);
  if (existingLinks.error) return failed(TRY_AGAIN);
  const link = await supabase
    .from("guardian_links")
    .insert({
      school_id: ctx.schoolId,
      guardian_id: guardianId,
      learner_id: learnerId,
      relationship: g.relationship,
      is_primary: false,
    })
    .select("id")
    .single();
  if (link.error?.code === "23505") return failed("This guardian is already linked.");
  if (link.error) return failed(TRY_AGAIN);
  if (
    (g.isPrimary || existingLinks.data.length === 0) &&
    !(await makePrimary(learnerId, link.data.id))
  )
    return failed(TRY_AGAIN);

  revalidatePath(learnerPath(learnerId));
  return saved(
    matched.plan.id
      ? `Linked to ${matched.plan.fullName}, already a guardian at the school.`
      : `${g.fullName} added.`,
  );
}

/** US-3.3: edit a guardian's details (shared with siblings) and this link. */
export async function saveGuardian(
  learnerId: string,
  linkId: string,
  guardianId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId) || !isUuid(linkId) || !isUuid(guardianId)) return NOT_ALLOWED;
  const parsed = parseGuardianForm(guardianFields(formData));
  if (!parsed.ok) return failed("Check the guardian's details.", guardianErrors(parsed.errors));
  const g = parsed.value;

  // The new phone or email must not belong to another guardian.
  const clash = new GuardianMatcher(
    (await listGuardians(ctx.schoolId)).filter((x) => x.id !== guardianId),
  ).match(g.fullName, g.phone, g.email);
  if ("plan" in clash && clash.plan.id) {
    return failed(
      `${clash.plan.fullName} already has that phone or email. Link that guardian instead.`,
    );
  }

  const supabase = await createClient();
  const updated = await supabase
    .from("guardians")
    .update({ full_name: g.fullName, phone: g.phone, email: g.email })
    .eq("id", guardianId)
    .eq("school_id", ctx.schoolId)
    .select("id");
  if (updated.error || updated.data.length !== 1) return failed(TRY_AGAIN);
  const link = await supabase
    .from("guardian_links")
    .update({ relationship: g.relationship })
    .eq("id", linkId)
    .eq("learner_id", learnerId)
    .select("id, is_primary");
  if (link.error || link.data.length !== 1) return failed(TRY_AGAIN);
  if (g.isPrimary && !link.data[0]!.is_primary && !(await makePrimary(learnerId, linkId)))
    return failed(TRY_AGAIN);

  revalidatePath(learnerPath(learnerId));
  return saved(`${g.fullName} saved.`);
}

/** Removes a wrong guardian link; the guardian themselves is kept (D23). */
export async function removeGuardianLink(learnerId: string, linkId: string): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId) || !isUuid(linkId)) return NOT_ALLOWED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardian_links")
    .delete()
    .eq("id", linkId)
    .eq("learner_id", learnerId)
    .select("id");
  if (error || data.length !== 1) return failed(TRY_AGAIN);
  revalidatePath(learnerPath(learnerId));
  return saved("Guardian unlinked.");
}

// Staff -------------------------------------------------------------------------------

function staffPath(userId: string): string {
  return `/admin/people/staff/${userId}`;
}

/**
 * People who already accepted a role in this school. A new role for them
 * starts active; anyone else's starts `invited` until they accept (D27).
 */
async function activeStaffIds(schoolId: string): Promise<Set<string>> {
  const staff = await listStaff(schoolId);
  return new Set(
    staff.filter((p) => p.memberships.some((m) => m.status === "active")).map((p) => p.userId),
  );
}

/** US-3.3: add one staff member with an invite, as the staff import does. */
export async function addStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx) return NOT_ALLOWED;
  const parsed = parseStaffForm({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role"),
  });
  if (!parsed.ok) return failed("Check the details.", parsed.errors);
  const p = parsed.value;

  const staff = await listStaff(ctx.schoolId);
  const already = staff
    .find((s) => s.email === p.email)
    ?.memberships.find((m) => m.role === p.role);
  if (already) {
    return failed(null, {
      email: `${p.email} is already a ${STAFF_ROLE_LABELS[p.role].toLowerCase()} here.`,
    });
  }

  const found = await findOrCreateAccounts([p]);
  if (!found.ok)
    return found.unproved
      ? failed(null, { email: unprovedMessage(found.unproved) })
      : failed(TRY_AGAIN);
  const account = found.accounts[0]!;
  if (account.userId === ctx.userId) return failed("You cannot add a role for yourself.");

  const status = (await activeStaffIds(ctx.schoolId)).has(account.userId) ? "active" : "invited";
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").insert({
    school_id: ctx.schoolId,
    user_id: account.userId,
    role: p.role,
    status,
  });
  if (error) return failed(TRY_AGAIN);

  const notSent = await sendStaffInvites(
    ctx.schoolId,
    found.accounts,
    new Map([[p.email, p.fullName]]),
  );
  revalidatePath("/admin/people/staff");
  if (notSent.length) {
    redirect(`${staffPath(account.userId)}?invite=failed`);
  }
  const added = status === "active" ? "active" : account.hasAccount ? "has-account" : "invited";
  redirect(`${staffPath(account.userId)}?added=${added}`);
}

/** US-3.3: a staff member's name and phone. */
export async function updateStaffDetails(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(userId)) return NOT_ALLOWED;
  const parsed = parseStaffProfile({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });
  if (!parsed.ok) return failed("Check the details.", parsed.errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_staff_profile", {
    p_school_id: ctx.schoolId,
    p_user_id: userId,
    p_full_name: parsed.value.fullName,
    // The function takes null for "no phone"; the generated type says string.
    p_phone: parsed.value.phone as string,
  });
  if (error?.message === "staff_shared") {
    return failed("They also belong to another school, so they change their own details.");
  }
  if (error) return failed(TRY_AGAIN);
  revalidatePath(staffPath(userId));
  revalidatePath("/admin/people/staff");
  return saved(`${parsed.value.fullName} saved.`);
}

/**
 * US-3.3: disable a role (a leaver) or re-enable it. Nobody disables their
 * own role. Re-enabling gives access back at once only to someone with
 * another active role here; anyone else goes back to `invited` and
 * accepts again (D27), so "Resend invite" works for them.
 */
export async function setMembershipStatus(
  userId: string,
  membershipId: string,
  next: "active" | "disabled",
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(userId) || !isUuid(membershipId)) return NOT_ALLOWED;
  if (userId === ctx.userId) return failed("You cannot change your own access.");

  const status =
    next === "disabled"
      ? "disabled"
      : (await activeStaffIds(ctx.schoolId)).has(userId)
        ? "active"
        : "invited";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ status })
    .eq("id", membershipId)
    .eq("user_id", userId)
    .eq("school_id", ctx.schoolId)
    .select("role");
  if (error || data.length !== 1) return failed(TRY_AGAIN);
  revalidatePath(staffPath(userId));
  revalidatePath("/admin/people/staff");
  const role = STAFF_ROLE_LABELS[data[0]!.role as keyof typeof STAFF_ROLE_LABELS] ?? "Role";
  return saved(next === "disabled" ? `${role} access disabled.` : `${role} access restored.`);
}

/** A further role for a staff member (a teacher who becomes a head of department). */
export async function addStaffRole(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(userId)) return NOT_ALLOWED;
  if (userId === ctx.userId) return failed("You cannot add a role for yourself.");
  const role = formData.get("role");
  if (!isStaffRole(role)) return failed(null, { role: "Choose a role." });

  const status = (await activeStaffIds(ctx.schoolId)).has(userId) ? "active" : "invited";
  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .insert({ school_id: ctx.schoolId, user_id: userId, role, status });
  if (error?.code === "23505") return failed(null, { role: "They already have this role." });
  if (error) return failed(TRY_AGAIN);
  revalidatePath(staffPath(userId));
  revalidatePath("/admin/people/staff");
  return saved(`${STAFF_ROLE_LABELS[role]} role added.`);
}

/** Sends a staff member's invite email again while it is not accepted (D14). */
export async function resendStaffInviteAction(userId: string): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(userId)) return NOT_ALLOWED;
  const person = (await listStaff(ctx.schoolId)).find((p) => p.userId === userId);
  const pending = person?.memberships.find((m) => m.status === "invited");
  if (!person || !pending) {
    revalidatePath(staffPath(userId));
    return failed("This invite is no longer waiting.");
  }

  const outcome = await sendInviteEmail(person.email);
  if (outcome !== "sent") return failed(resendProblem(outcome, person.email));

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_staff_invite_event", {
    p_membership_id: pending.id,
    p_event: "invite_resent",
  });
  const message = `Invite sent again to ${person.email}.`;
  return error ? failed(`${message} It could not be recorded in the audit log.`) : saved(message);
}

// Imports -----------------------------------------------------------------------------

const MAX_STORED_ERRORS = 500;

type ImportKind = "staff" | "learners";

/** Reads and checks a file against the school as it is now. */
async function planFile(schoolId: string, kind: ImportKind, bytes: Uint8Array) {
  const read = readUpload(bytes);
  if (!read.ok) return { read, errors: [{ row: 0, message: read.error }] } as const;
  if (kind === "staff") {
    const plan = planStaffImport(read.rows, existingStaffFor(await listStaff(schoolId)));
    return { read, errors: plan.errors, staff: plan, summary: summariseStaffPlan(plan) } as const;
  }
  const year = await currentYear(schoolId);
  const [classes, numbers, guardians] = await Promise.all([
    year ? listYearClasses(year.id) : Promise.resolve([]),
    listLearnerNumbers(schoolId),
    listGuardians(schoolId),
  ]);
  const plan = planLearnerImport(
    read.rows,
    { classes, existingLearnerNumbers: numbers, existingGuardians: guardians },
    today(),
  );
  const errors = year
    ? plan.errors
    : [{ row: 0, message: "Set up this year's classes before importing learners." }];
  return { read, errors, learners: plan, summary: summariseLearnerPlan(plan) } as const;
}

/**
 * US-3.1 and US-3.2, step 1: upload and check. The file is stored in the
 * private `imports` bucket and the result recorded in import_jobs as
 * `validated` (ready to commit) or `failed` (with the per-row errors).
 * Nothing is imported yet.
 */
export async function uploadImport(
  kind: ImportKind,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || (kind !== "staff" && kind !== "learners")) return NOT_ALLOWED;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failed(null, { file: "Choose a CSV or Excel file to upload." });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = await planFile(ctx.schoolId, kind, bytes);
  const jobId = crypto.randomUUID();
  const supabase = await createClient();

  let filePath: string | null = null;
  if (checked.read.ok) {
    filePath = `${ctx.schoolId}/${jobId}.${checked.read.kind}`;
    const upload = await supabase.storage
      .from("imports")
      .upload(filePath, bytes, { contentType: uploadContentType(checked.read.kind) });
    if (upload.error) return failed("Could not store the file. Please try again.");
  }

  const report: ImportReport = {
    fileName: file.name.slice(0, 120),
    errors: checked.errors.slice(0, MAX_STORED_ERRORS),
    summary: (checked.errors.length
      ? { errorCount: checked.errors.length }
      : checked.summary) as Json,
  };
  const { error } = await supabase.from("import_jobs").insert({
    id: jobId,
    school_id: ctx.schoolId,
    kind,
    status: checked.errors.length ? "failed" : "validated",
    file_path: filePath,
    error_report: report as Json,
  });
  if (error) return failed("Could not record the import. Please try again.");

  revalidatePath("/admin/people/import");
  redirect(`/admin/people/import/${jobId}`);
}

/**
 * Step 2: commit. The stored file is checked again against the school as
 * it is now, then everything is added in one transaction (D24), or nothing.
 */
export async function commitImport(jobId: string): Promise<FormState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(jobId)) return NOT_ALLOWED;
  const job = await getImportJob(ctx.schoolId, jobId);
  const path = `/admin/people/import/${jobId}`;
  if (job.status !== "validated" || !job.filePath || job.kind === "marks") {
    revalidatePath(path);
    return failed("This import is no longer waiting to be committed.");
  }

  const supabase = await createClient();
  const download = await supabase.storage.from("imports").download(job.filePath);
  if (download.error) return failed("Could not read the stored file. Please try again.");
  const checked = await planFile(
    ctx.schoolId,
    job.kind,
    new Uint8Array(await download.data.arrayBuffer()),
  );

  if (checked.errors.length) {
    await supabase
      .from("import_jobs")
      .update({
        status: "failed",
        error_report: {
          ...job.report,
          errors: checked.errors.slice(0, MAX_STORED_ERRORS),
          summary: { errorCount: checked.errors.length },
        } as Json,
      })
      .eq("id", jobId);
    revalidatePath(path);
    return failed("The school's records changed since the check, so nothing was imported.");
  }

  if ("learners" in checked && checked.learners) {
    const { error } = await supabase.rpc("commit_learner_import", {
      p_job_id: jobId,
      ...learnerJson(checked.learners.guardians, checked.learners.learners),
    });
    if (error) return failed("Nothing was imported. Please try again.");
    revalidatePath(path);
    revalidatePath("/admin/people/learners");
    return saved(`${checked.learners.learners.length} learners imported.`);
  }

  if ("staff" in checked && checked.staff) {
    const rows = checked.staff.staff;
    const found = await findOrCreateAccounts(rows);
    if (!found.ok) {
      return failed(
        found.unproved
          ? `Nothing was imported. ${unprovedMessage(found.unproved)}`
          : "Nothing was imported. Please try again.",
      );
    }
    const userIdByEmail = new Map(found.accounts.map((a) => [a.email, a.userId]));
    const activeHere = await activeStaffIds(ctx.schoolId);
    const { error } = await supabase.rpc("commit_staff_import", {
      p_job_id: jobId,
      p_members: rows.map((row) => {
        const userId = userIdByEmail.get(row.email)!;
        return {
          user_id: userId,
          role: row.role,
          status: activeHere.has(userId) ? "active" : "invited",
        };
      }) as Json,
    });
    if (error) return failed("Nothing was imported. Please try again.");

    const notSent = await sendStaffInvites(
      ctx.schoolId,
      found.accounts,
      new Map(rows.map((row) => [row.email, row.fullName])),
    );
    if (notSent.length) {
      const current = await getImportJob(ctx.schoolId, jobId);
      await supabase
        .from("import_jobs")
        .update({ error_report: { ...current.report, notInvited: notSent } as Json })
        .eq("id", jobId);
    }
    revalidatePath(path);
    revalidatePath("/admin/people/staff");
    return notSent.length
      ? failed(
          `${rows.length} staff added, but ${notSent.length} invite emails could not be sent. Use "Resend invite" on their pages.`,
        )
      : saved(`${rows.length} staff added and invited.`);
  }
  return failed(TRY_AGAIN);
}

// Parent codes and learner PINs ---------------------------------------------------------

/** The portal's address as the admin reached it, for links printed on slips. */
async function portalOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Harare",
  }).format(new Date(iso));
}

const secretFailed = (message: string): SecretState => ({
  status: "error",
  message,
  secret: null,
});

/**
 * US-1.3: a one-time code (and link) for a guardian of this learner to set
 * up their parent account. Only the code's hash is stored; any older code
 * for the guardian stops working (D25).
 */
export async function createParentCode(
  learnerId: string,
  guardianId: string,
): Promise<SecretState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId) || !isUuid(guardianId)) {
    return secretFailed(NOT_ALLOWED.message!);
  }
  const supabase = await createClient();
  const link = await supabase
    .from("guardian_links")
    .select("guardians!inner(full_name)")
    .eq("learner_id", learnerId)
    .eq("guardian_id", guardianId)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (link.error || !link.data) return secretFailed("This guardian is no longer linked.");

  const code = generateInviteCode(randomInt);
  const { data, error } = await supabase.rpc("create_parent_invite", {
    p_guardian_id: guardianId,
    p_code_hash: hashInviteCode(code),
  });
  if (error?.message === "this guardian already has an account") {
    revalidatePath(learnerPath(learnerId));
    return secretFailed("This guardian already has a parent account.");
  }
  if (error || !data[0]) return secretFailed("Could not make a code. Please try again.");

  revalidatePath(learnerPath(learnerId));
  return {
    status: "saved",
    message: null,
    secret: {
      label: `Parent code for ${link.data.guardians.full_name}`,
      value: formatInviteCode(code),
      details: [
        `Or open ${inviteLink(await portalOrigin(), code)}`,
        `Works once, until ${formatDay(data[0].expires_at)}. Making a new code stops this one.`,
      ],
    },
  };
}

/**
 * US-1.2 and US-1.7 for learners: gives the learner a new random PIN (and
 * their account, the first time). They choose their own at their next sign
 * in. The PIN is shown once and recorded in the audit log without its value.
 */
export async function resetLearnerPin(learnerId: string): Promise<SecretState> {
  const ctx = await adminContext();
  if (!ctx || !isUuid(learnerId)) return secretFailed(NOT_ALLOWED.message!);
  const supabase = await createClient();
  const [learner, school] = await Promise.all([
    supabase
      .from("learners")
      .select("id, learner_number, first_name, last_name, status, user_id")
      .eq("id", learnerId)
      .eq("school_id", ctx.schoolId)
      .maybeSingle(),
    supabase.from("schools").select("slug").eq("id", ctx.schoolId).maybeSingle(),
  ]);
  if (learner.error || !learner.data || school.error || !school.data) {
    return secretFailed(TRY_AGAIN);
  }
  const l = learner.data;
  if (l.status !== "active") return secretFailed("Only active learners can sign in.");

  const fullName = `${l.first_name} ${l.last_name}`;
  const issued = await issueLearnerPin({
    id: l.id,
    schoolId: ctx.schoolId,
    userId: l.user_id,
    fullName,
  });
  if (!issued) return secretFailed("Could not set a PIN. Please try again.");
  const linked = await supabase.rpc("link_learner_login", {
    p_learner_id: l.id,
    p_user_id: issued.userId,
  });
  if (linked.error) return secretFailed("Could not set a PIN. Please try again.");

  revalidatePath(learnerPath(learnerId));
  return {
    status: "saved",
    message: null,
    secret: {
      label: `PIN for ${fullName}`,
      value: issued.pin,
      details: [
        `Learner number ${l.learner_number}. Sign in at ${await portalOrigin()}/sign-in/learner?school=${school.data.slug}`,
        "They choose their own PIN when they first sign in. Any earlier PIN stops working.",
      ],
    },
  };
}
