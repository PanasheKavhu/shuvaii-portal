import {
  isValidEmail,
  isValidPhone,
  nameKey,
  normaliseEmail,
  normalisePhone,
  parseDate,
  parseSex,
  text,
  type Sex,
} from "./fields";
import { readSheet, type ColumnSpec, type RowError, type SheetRecord } from "./sheet";

/**
 * Validates a learners-and-guardians import (SPEC US-3.2) and plans what
 * to create. Pure: the caller passes this year's classes and the school's
 * existing learner numbers and guardians.
 *
 * - Learner numbers must be unique in the school and in the file.
 * - The class must be one of this year's classes (matched by name,
 *   ignoring case and extra spaces); unknown classes are reported.
 * - A guardian is matched by phone or email, against the school's existing
 *   guardians and earlier rows of the file, so siblings share one guardian
 *   (and later one parent login). A phone that names one guardian and an
 *   email that names another is an error.
 * - Any error means nothing is imported (all or nothing).
 */

export const LEARNER_COLUMNS = [
  {
    key: "learner_number",
    label: "learner_number",
    required: true,
    aliases: ["learner number", "learner no", "student number", "number"],
  },
  { key: "first_name", label: "first_name", required: true, aliases: ["first names", "firstname"] },
  { key: "last_name", label: "last_name", required: true, aliases: ["surname", "lastname"] },
  { key: "date_of_birth", label: "date_of_birth", required: false, aliases: ["dob", "birth date"] },
  { key: "sex", label: "sex", required: false, aliases: ["gender"] },
  { key: "class", label: "class", required: true, aliases: ["class name"] },
  { key: "admission_date", label: "admission_date", required: false, aliases: ["admitted"] },
  {
    key: "guardian_name",
    label: "guardian_name",
    required: false,
    aliases: ["guardian", "parent name", "guardian full name"],
  },
  {
    key: "guardian_relationship",
    label: "guardian_relationship",
    required: false,
    aliases: ["relationship"],
  },
  { key: "guardian_phone", label: "guardian_phone", required: false, aliases: ["parent phone"] },
  { key: "guardian_email", label: "guardian_email", required: false, aliases: ["parent email"] },
] as const satisfies readonly ColumnSpec<string>[];

export type LearnerColumn = (typeof LEARNER_COLUMNS)[number]["key"];

export type ImportClass = { id: string; name: string };
export type ExistingGuardian = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
};

export type LearnerImportContext = {
  /** This year's classes. */
  classes: readonly ImportClass[];
  /** Learner numbers already used in the school. */
  existingLearnerNumbers: Iterable<string>;
  existingGuardians: readonly ExistingGuardian[];
};

export type GuardianPlan = {
  /** Reference used by the learners below: "g1", "g2"... */
  ref: string;
  /** The existing guardian to link to, or null to create one. */
  id: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
};

export type LearnerPlan = {
  row: number;
  learnerNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: Sex | null;
  admissionDate: string | null;
  classId: string;
  className: string;
  guardianRef: string | null;
  relationship: string | null;
};

export type LearnerImportPlan = {
  errors: RowError[];
  learners: LearnerPlan[];
  /** Only guardians some learner links to. */
  guardians: GuardianPlan[];
};

/** Learner numbers compare without case, so MSH1 and msh1 cannot both exist. */
export function learnerNumberKey(value: string): string {
  return value.trim().toUpperCase();
}

export function validLearnerNumber(value: string): boolean {
  return value.length >= 1 && value.length <= 30;
}

export function validPersonName(value: string, max = 80): boolean {
  return value.length >= 1 && value.length <= max;
}

/** A date of birth no later than today and no earlier than 1950. */
export function plausibleBirthDate(iso: string, today: string): boolean {
  return iso >= "1950-01-01" && iso <= today;
}

/**
 * Finds guardians by phone or email across existing guardians and earlier
 * rows. Existing guardians become plans only once a row links to them.
 */
export class GuardianMatcher {
  private plans: GuardianPlan[] = [];
  private byPhone = new Map<string, GuardianPlan>();
  private byEmail = new Map<string, GuardianPlan>();
  private existingByPhone = new Map<string, ExistingGuardian>();
  private existingByEmail = new Map<string, ExistingGuardian>();
  private planForExisting = new Map<string, GuardianPlan>();

  constructor(existing: readonly ExistingGuardian[]) {
    for (const g of existing) {
      const phone = normalisePhone(g.phone);
      const email = normaliseEmail(g.email);
      if (phone && !this.existingByPhone.has(phone)) this.existingByPhone.set(phone, g);
      if (email && !this.existingByEmail.has(email)) this.existingByEmail.set(email, g);
    }
  }

  private find(phone: string | null, email: string | null) {
    const fromPhone = phone
      ? (this.byPhone.get(phone) ?? this.existingPlan(this.existingByPhone.get(phone)))
      : null;
    const fromEmail = email
      ? (this.byEmail.get(email) ?? this.existingPlan(this.existingByEmail.get(email)))
      : null;
    return { fromPhone, fromEmail };
  }

  private existingPlan(g: ExistingGuardian | undefined): GuardianPlan | null {
    if (!g) return null;
    const known = this.planForExisting.get(g.id);
    if (known) return known;
    // Not yet registered: a provisional plan, added to the list on use.
    return {
      ref: "",
      id: g.id,
      fullName: g.fullName,
      phone: normalisePhone(g.phone),
      email: normaliseEmail(g.email),
    };
  }

  private register(plan: GuardianPlan): GuardianPlan {
    if (plan.ref) return plan;
    if (plan.id) {
      const known = this.planForExisting.get(plan.id);
      if (known) return known;
    }
    plan.ref = `g${this.plans.length + 1}`;
    this.plans.push(plan);
    if (plan.id) this.planForExisting.set(plan.id, plan);
    if (plan.phone && !this.byPhone.has(plan.phone)) this.byPhone.set(plan.phone, plan);
    if (plan.email && !this.byEmail.has(plan.email)) this.byEmail.set(plan.email, plan);
    return plan;
  }

  /**
   * The guardian for these details: an existing or earlier one with the
   * same phone or email, or a new one. Returns an error message when the
   * phone and email point at two different guardians.
   */
  match(
    fullName: string,
    phone: string | null,
    email: string | null,
  ): { plan: GuardianPlan } | { error: string } {
    const { fromPhone, fromEmail } = this.find(phone, email);
    if (fromPhone && fromEmail && !sameGuardian(fromPhone, fromEmail)) {
      return {
        error: `The guardian's phone belongs to ${fromPhone.fullName} but the email belongs to ${fromEmail.fullName}. Use one guardian's details.`,
      };
    }
    const found = fromPhone ?? fromEmail;
    if (found) {
      const plan = this.register(found);
      // A guardian first seen in this file picks up details a later row adds.
      if (!plan.id) {
        if (!plan.phone && phone) {
          plan.phone = phone;
          this.byPhone.set(phone, plan);
        }
        if (!plan.email && email) {
          plan.email = email;
          this.byEmail.set(email, plan);
        }
      }
      return { plan };
    }
    return { plan: this.register({ ref: "", id: null, fullName, phone, email }) };
  }

  get guardians(): GuardianPlan[] {
    return this.plans;
  }
}

function sameGuardian(a: GuardianPlan, b: GuardianPlan): boolean {
  if (a === b) return true;
  if (a.id && a.id === b.id) return true;
  return a.ref !== "" && a.ref === b.ref;
}

export function validateLearnerRecords(
  records: readonly SheetRecord<LearnerColumn>[],
  context: LearnerImportContext,
  today: string,
): LearnerImportPlan {
  const errors: RowError[] = [];
  const learners: LearnerPlan[] = [];
  const classes = new Map(context.classes.map((c) => [nameKey(c.name), c]));
  const taken = new Set([...context.existingLearnerNumbers].map(learnerNumberKey));
  const seenInFile = new Map<string, number>();
  const matcher = new GuardianMatcher(context.existingGuardians);

  for (const { row, values: v } of records) {
    const rowErrors: string[] = [];
    const learnerNumber = text(v.learner_number);
    const firstName = text(v.first_name);
    const lastName = text(v.last_name);
    const className = text(v.class);
    const dateOfBirth = parseDate(v.date_of_birth);
    const admissionDate = parseDate(v.admission_date);
    const sex = parseSex(v.sex);

    if (!learnerNumber) rowErrors.push("Learner number is missing.");
    else if (!validLearnerNumber(learnerNumber))
      rowErrors.push("Learner number must be 30 characters or fewer.");
    else {
      const key = learnerNumberKey(learnerNumber);
      if (taken.has(key))
        rowErrors.push(`Learner number ${learnerNumber} already exists in the school.`);
      else if (seenInFile.has(key))
        rowErrors.push(`Learner number ${learnerNumber} is also on row ${seenInFile.get(key)}.`);
      else seenInFile.set(key, row);
    }
    if (!validPersonName(firstName)) rowErrors.push("First name is missing or too long.");
    if (!validPersonName(lastName)) rowErrors.push("Last name is missing or too long.");
    if (dateOfBirth === "invalid")
      rowErrors.push(`Date of birth "${text(v.date_of_birth)}" is not a date. Use YYYY-MM-DD.`);
    else if (dateOfBirth && !plausibleBirthDate(dateOfBirth, today))
      rowErrors.push(`Date of birth ${dateOfBirth} is not plausible.`);
    if (admissionDate === "invalid")
      rowErrors.push(`Admission date "${text(v.admission_date)}" is not a date. Use YYYY-MM-DD.`);
    if (sex === "invalid") rowErrors.push(`Sex "${text(v.sex)}" must be F or M.`);

    const klass = classes.get(nameKey(className));
    if (!className) rowErrors.push("Class is missing.");
    else if (!klass) rowErrors.push(`Unknown class "${className}". Use a class from this year.`);

    // Guardian: optional, but complete if any guardian column is filled.
    const gName = text(v.guardian_name);
    const gPhoneRaw = text(v.guardian_phone);
    const gEmailRaw = text(v.guardian_email);
    const relationship = text(v.guardian_relationship).toLowerCase() || "guardian";
    const gPhone = normalisePhone(v.guardian_phone);
    const gEmail = normaliseEmail(v.guardian_email);
    let guardianRef: string | null = null;
    const anyGuardian = gName || gPhoneRaw || gEmailRaw || text(v.guardian_relationship);
    if (anyGuardian) {
      const guardianErrors: string[] = [];
      if (!validPersonName(gName, 120)) guardianErrors.push("Guardian name is missing.");
      if (!gPhone && !gEmail) guardianErrors.push("Give the guardian's phone or email.");
      if (gPhone && !isValidPhone(gPhone))
        guardianErrors.push(`Guardian phone "${gPhoneRaw}" is not a phone number.`);
      if (gEmail && !isValidEmail(gEmail))
        guardianErrors.push(`Guardian email "${gEmailRaw}" is not a valid email.`);
      if (relationship.length > 40)
        guardianErrors.push("Relationship must be 40 characters or fewer.");
      if (guardianErrors.length === 0) {
        const matched = matcher.match(gName, gPhone, gEmail);
        if ("error" in matched) guardianErrors.push(matched.error);
        else guardianRef = matched.plan.ref;
      }
      rowErrors.push(...guardianErrors);
    }

    if (rowErrors.length) {
      for (const message of rowErrors) errors.push({ row, message });
      continue;
    }
    learners.push({
      row,
      learnerNumber,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth as string | null,
      sex: sex as Sex | null,
      admissionDate: admissionDate as string | null,
      classId: klass!.id,
      className: klass!.name,
      guardianRef,
      relationship: guardianRef ? relationship : null,
    });
  }

  const used = new Set(learners.map((l) => l.guardianRef).filter(Boolean));
  return { errors, learners, guardians: matcher.guardians.filter((g) => used.has(g.ref)) };
}

/** Reads and validates a whole learners sheet. */
export function planLearnerImport(
  rows: readonly (readonly (string | number | boolean | null)[])[],
  context: LearnerImportContext,
  today: string,
): LearnerImportPlan {
  const sheet = readSheet(rows, LEARNER_COLUMNS);
  if (!sheet.ok) return { errors: sheet.errors, learners: [], guardians: [] };
  return validateLearnerRecords(sheet.records, context, today);
}

export type LearnerImportSummary = {
  learners: number;
  newGuardians: number;
  existingGuardians: number;
  /** Guardians linked to more than one learner in this file. */
  sharedGuardians: number;
  byClass: { className: string; count: number }[];
};

export function summariseLearnerPlan(plan: LearnerImportPlan): LearnerImportSummary {
  const perGuardian = new Map<string, number>();
  const perClass = new Map<string, number>();
  for (const l of plan.learners) {
    if (l.guardianRef) perGuardian.set(l.guardianRef, (perGuardian.get(l.guardianRef) ?? 0) + 1);
    perClass.set(l.className, (perClass.get(l.className) ?? 0) + 1);
  }
  return {
    learners: plan.learners.length,
    newGuardians: plan.guardians.filter((g) => !g.id).length,
    existingGuardians: plan.guardians.filter((g) => g.id).length,
    sharedGuardians: [...perGuardian.values()].filter((n) => n > 1).length,
    byClass: [...perClass.entries()]
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true })),
  };
}
