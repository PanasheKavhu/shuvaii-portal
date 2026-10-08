import {
  isStaffRole,
  isValidEmail,
  isValidPhone,
  normaliseEmail,
  normalisePhone,
  parseDate,
  parseSex,
  text,
  type Sex,
  type StaffRole,
} from "./fields";
import { plausibleBirthDate, validLearnerNumber, validPersonName } from "./learner-import";

/**
 * Validates the manual add and edit forms on /admin/people (SPEC US-3.3).
 * Pure; the database repeats the rules that matter (unique learner number,
 * same-school links, no deletes).
 */

type Errors<T> = Partial<Record<keyof T, string>>;
export type Parse<T> = { ok: true; value: T } | { ok: false; errors: Errors<T> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LEARNER_STATUSES = ["active", "left", "graduated"] as const;
export type LearnerStatus = (typeof LEARNER_STATUSES)[number];
export const LEARNER_STATUS_LABELS: Record<LearnerStatus, string> = {
  active: "Active",
  left: "Left the school",
  graduated: "Graduated",
};

export const MEMBERSHIP_STATUSES = ["invited", "active", "disabled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Invited",
  active: "Active",
  disabled: "Disabled",
};

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export type LearnerDraft = {
  learnerNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: Sex | null;
  admissionDate: string | null;
  status: LearnerStatus;
  /** This year's class, or null for none. */
  classId: string | null;
};

export function parseLearnerForm(
  form: {
    learnerNumber: unknown;
    firstName: unknown;
    lastName: unknown;
    dateOfBirth: unknown;
    sex: unknown;
    admissionDate: unknown;
    status?: unknown;
    classId: unknown;
  },
  today: string,
): Parse<LearnerDraft> {
  const learnerNumber = text(form.learnerNumber);
  const firstName = text(form.firstName);
  const lastName = text(form.lastName);
  const dateOfBirth = parseDate(typeof form.dateOfBirth === "string" ? form.dateOfBirth : null);
  const admissionDate = parseDate(
    typeof form.admissionDate === "string" ? form.admissionDate : null,
  );
  const sex = parseSex(typeof form.sex === "string" ? form.sex : null);
  const status = form.status === undefined || form.status === "" ? "active" : form.status;
  const classId = text(form.classId);
  const errors: Errors<LearnerDraft> = {};

  if (!validLearnerNumber(learnerNumber))
    errors.learnerNumber = "Enter the learner number (up to 30 characters).";
  if (!validPersonName(firstName)) errors.firstName = "Enter the first name.";
  if (!validPersonName(lastName)) errors.lastName = "Enter the last name.";
  if (dateOfBirth === "invalid") errors.dateOfBirth = "Enter a valid date.";
  else if (dateOfBirth && !plausibleBirthDate(dateOfBirth, today))
    errors.dateOfBirth = "The date of birth must be in the past.";
  if (admissionDate === "invalid") errors.admissionDate = "Enter a valid date.";
  if (sex === "invalid") errors.sex = "Choose F or M.";
  if (!isOneOf(LEARNER_STATUSES, status)) errors.status = "Choose a status.";
  if (classId && !UUID_RE.test(classId)) errors.classId = "Choose a class.";

  if (Object.keys(errors).length || !isOneOf(LEARNER_STATUSES, status)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      learnerNumber,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth as string | null,
      sex: sex as Sex | null,
      admissionDate: admissionDate as string | null,
      status,
      classId: classId || null,
    },
  };
}

export type GuardianDraft = {
  fullName: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  isPrimary: boolean;
};

export function parseGuardianForm(form: {
  fullName: unknown;
  phone: unknown;
  email: unknown;
  relationship: unknown;
  isPrimary?: unknown;
}): Parse<GuardianDraft> {
  const fullName = text(form.fullName);
  const phone = normalisePhone(form.phone);
  const email = normaliseEmail(form.email);
  const relationship = text(form.relationship).toLowerCase() || "guardian";
  const errors: Errors<GuardianDraft> = {};

  if (!validPersonName(fullName, 120)) errors.fullName = "Enter the guardian's full name.";
  if (!phone && !email) errors.phone = "Give a phone number or an email (or both).";
  if (phone && !isValidPhone(phone)) errors.phone = "Enter a phone number such as 0772 123 456.";
  if (email && !isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (relationship.length > 40) errors.relationship = "Use 40 characters or fewer.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fullName,
      phone,
      email,
      relationship,
      isPrimary: form.isPrimary === "on" || form.isPrimary === true,
    },
  };
}

export type StaffDraft = {
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
};

export function parseStaffForm(form: {
  fullName: unknown;
  email: unknown;
  phone: unknown;
  role: unknown;
}): Parse<StaffDraft> {
  const fullName = text(form.fullName);
  const email = normaliseEmail(form.email) ?? "";
  const phone = normalisePhone(form.phone);
  const errors: Errors<StaffDraft> = {};

  if (fullName.length < 2 || fullName.length > 120) errors.fullName = "Enter the full name.";
  if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (phone && !isValidPhone(phone)) errors.phone = "Enter a phone number such as 0772 123 456.";
  if (!isStaffRole(form.role)) errors.role = "Choose a role.";

  if (Object.keys(errors).length || !isStaffRole(form.role)) return { ok: false, errors };
  return { ok: true, value: { fullName, email, phone, role: form.role } };
}

export type StaffProfileDraft = { fullName: string; phone: string | null };

export function parseStaffProfile(form: {
  fullName: unknown;
  phone: unknown;
}): Parse<StaffProfileDraft> {
  const fullName = text(form.fullName);
  const phone = normalisePhone(form.phone);
  const errors: Errors<StaffProfileDraft> = {};
  if (fullName.length < 2 || fullName.length > 120) errors.fullName = "Enter the full name.";
  if (phone && !isValidPhone(phone)) errors.phone = "Enter a phone number such as 0772 123 456.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { fullName, phone } };
}

/** Subject choices from a form: the ticked class subject ids, each a uuid. */
export function parseSubjectChoices(values: readonly unknown[]): string[] | null {
  const ids = values.filter((v): v is string => typeof v === "string");
  if (ids.length !== values.length || !ids.every((id) => UUID_RE.test(id))) return null;
  return [...new Set(ids)];
}

/**
 * Search words for the people lists, safe to put in a PostgREST `or`
 * filter: characters with a meaning there (commas, brackets, quotes,
 * wildcards, backslashes, colons) are dropped. At most five words.
 */
export function searchWords(query: unknown): string[] {
  return text(query)
    .replace(/[,()*%_\\:"'.]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => w.slice(0, 40));
}
