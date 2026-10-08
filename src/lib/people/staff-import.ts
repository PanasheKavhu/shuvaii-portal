import {
  STAFF_ROLE_LABELS,
  isValidEmail,
  isValidPhone,
  normaliseEmail,
  normalisePhone,
  parseStaffRole,
  text,
  type StaffRole,
} from "./fields";
import { readSheet, type ColumnSpec, type RowError, type SheetRecord } from "./sheet";

/**
 * Validates a staff import (SPEC US-3.1) and plans the invites. Pure: the
 * caller passes the school's existing staff memberships by email.
 *
 * Errors: a missing name, a bad email, an unknown role, an email that
 * appears twice in the file, and someone who already holds that role in
 * the school. Any error means nothing is imported.
 */

export const STAFF_COLUMNS = [
  { key: "full_name", label: "full_name", required: true, aliases: ["name", "full name"] },
  { key: "email", label: "email", required: true, aliases: ["email address", "e_mail"] },
  { key: "phone", label: "phone", required: false, aliases: ["phone number", "mobile"] },
  { key: "role", label: "role", required: true, aliases: ["position"] },
] as const satisfies readonly ColumnSpec<string>[];

export type StaffColumn = (typeof STAFF_COLUMNS)[number]["key"];

export type ExistingStaff = { email: string; role: StaffRole; status: string };

export type StaffPlan = {
  row: number;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
};

export type StaffImportPlan = { errors: RowError[]; staff: StaffPlan[] };

const ROLE_LIST = Object.values(STAFF_ROLE_LABELS).join(", ");

export function validateStaffRecords(
  records: readonly SheetRecord<StaffColumn>[],
  existing: readonly ExistingStaff[],
): StaffImportPlan {
  const errors: RowError[] = [];
  const staff: StaffPlan[] = [];
  const held = new Map<string, string>();
  for (const m of existing) held.set(`${m.email.toLowerCase()}|${m.role}`, m.status);
  const seen = new Map<string, number>();

  for (const { row, values: v } of records) {
    const rowErrors: string[] = [];
    const fullName = text(v.full_name);
    const emailRaw = text(v.email);
    const email = normaliseEmail(v.email);
    const phoneRaw = text(v.phone);
    const phone = normalisePhone(v.phone);
    const role = parseStaffRole(v.role);

    if (fullName.length < 2 || fullName.length > 120) rowErrors.push("Full name is missing.");
    if (!email) rowErrors.push("Email is missing.");
    else if (!isValidEmail(email)) rowErrors.push(`Email "${emailRaw}" is not a valid email.`);
    else if (seen.has(email)) rowErrors.push(`${email} is also on row ${seen.get(email)}.`);
    else seen.set(email, row);
    if (phone && !isValidPhone(phone)) rowErrors.push(`Phone "${phoneRaw}" is not a phone number.`);
    if (!role) {
      rowErrors.push(
        text(v.role)
          ? `Unknown role "${text(v.role)}". Use one of: ${ROLE_LIST}.`
          : `Role is missing. Use one of: ${ROLE_LIST}.`,
      );
    }
    if (email && role) {
      const status = held.get(`${email}|${role}`);
      if (status === "disabled") {
        rowErrors.push(
          `${email} is already a ${STAFF_ROLE_LABELS[role].toLowerCase()} here but disabled. Re-enable them from their staff page.`,
        );
      } else if (status) {
        rowErrors.push(
          `${email} is already a ${STAFF_ROLE_LABELS[role].toLowerCase()} in this school.`,
        );
      }
    }

    if (rowErrors.length) {
      for (const message of rowErrors) errors.push({ row, message });
      continue;
    }
    staff.push({ row, fullName, email: email!, phone, role: role! });
  }
  return { errors, staff };
}

/** Reads and validates a whole staff sheet. */
export function planStaffImport(
  rows: readonly (readonly (string | number | boolean | null)[])[],
  existing: readonly ExistingStaff[],
): StaffImportPlan {
  const sheet = readSheet(rows, STAFF_COLUMNS);
  if (!sheet.ok) return { errors: sheet.errors, staff: [] };
  return validateStaffRecords(sheet.records, existing);
}

export type StaffImportSummary = { staff: number; byRole: { role: StaffRole; count: number }[] };

export function summariseStaffPlan(plan: StaffImportPlan): StaffImportSummary {
  const perRole = new Map<StaffRole, number>();
  for (const s of plan.staff) perRole.set(s.role, (perRole.get(s.role) ?? 0) + 1);
  return {
    staff: plan.staff.length,
    byRole: [...perRole.entries()].map(([role, count]) => ({ role, count })),
  };
}
