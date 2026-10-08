/**
 * Cell and form value normalisers shared by the people forms and imports
 * (SPEC US-3.1 to US-3.3). Pure.
 *
 * A value can be a form string or a spreadsheet cell (string, number,
 * boolean, or null for an empty cell).
 */

export type CellValue = string | number | boolean | null | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed text with inner runs of whitespace collapsed; "" for empty. */
export function text(value: unknown): string {
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** A lower-cased email, or null if empty. Check it with isValidEmail. */
export function normaliseEmail(value: unknown): string | null {
  const s = text(value).toLowerCase();
  return s === "" ? null : s;
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * A phone number in one comparable form, or null if empty. Spaces, dashes,
 * dots and brackets go; Zimbabwe numbers written +263 77..., 263 77... or
 * 00263 77... become 077...; a spreadsheet that dropped the leading zero
 * (772123456 typed as a number) gets it back. Check it with isValidPhone.
 */
export function normalisePhone(value: unknown): string | null {
  let s = text(value).replace(/[\s\-.()]/g, "");
  if (s === "") return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^\+263\d{9}$/.test(s)) s = `0${s.slice(4)}`;
  else if (/^263\d{9}$/.test(s)) s = `0${s.slice(3)}`;
  else if (/^[1-9]\d{8}$/.test(s)) s = `0${s}`;
  return s;
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{7,15}$/.test(phone);
}

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date as YYYY-MM-DD, or null if empty, or "invalid". Accepts
 * 2012-02-13, 2012/02/13, 13/02/2012 and 13-02-2012 (day first, as written
 * in Zimbabwe), and Excel date cells (serial day numbers).
 */
export function parseDate(value: CellValue): string | null | "invalid" {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 2958465) return "invalid";
    // Excel day 1 is 1900-01-01; counting from 1899-12-30 absorbs its 1900 leap-year bug.
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  }
  const s = text(value);
  if (s === "") return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3])) ?? "invalid";
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1])) ?? "invalid";
  // An ISO timestamp, as some exports write dates.
  m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3])) ?? "invalid";
  return "invalid";
}

export type Sex = "F" | "M";

/** F or M from F, M, female, male, girl or boy; null if empty, or "invalid". */
export function parseSex(value: CellValue): Sex | null | "invalid" {
  const s = text(value).toLowerCase();
  if (s === "") return null;
  if (["f", "female", "girl"].includes(s)) return "F";
  if (["m", "male", "boy"].includes(s)) return "M";
  return "invalid";
}

export const STAFF_ROLES = ["school_admin", "head", "hod", "teacher"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  school_admin: "School admin",
  head: "Head",
  hod: "Head of department",
  teacher: "Teacher",
};

const ROLE_WORDS: Record<string, StaffRole> = {
  school_admin: "school_admin",
  admin: "school_admin",
  administrator: "school_admin",
  head: "head",
  headmaster: "head",
  headmistress: "head",
  head_teacher: "head",
  headteacher: "head",
  hod: "hod",
  head_of_department: "hod",
  teacher: "teacher",
};

/** A staff role from its name or label ("Teacher", "HOD", "school admin"), or null. */
export function parseStaffRole(value: CellValue): StaffRole | null {
  const key = text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ROLE_WORDS[key] ?? null;
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** A name to compare classes by: "4 blue", "4  Blue " and "4 Blue" match. */
export function nameKey(value: unknown): string {
  return text(value).toLowerCase();
}
