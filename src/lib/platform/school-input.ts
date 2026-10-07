/**
 * Validates the super-admin console forms at the server-action boundary
 * (SPEC US-10.1, US-1.5). Pure.
 */
import { normalizeEmail } from "@/lib/auth/sign-in-input";

export const SCHOOL_STAGES = ["primary", "secondary", "combined"] as const;
export type SchoolStage = (typeof SCHOOL_STAGES)[number];

export const STAGE_LABELS: Record<SchoolStage, string> = {
  primary: "Primary",
  secondary: "Secondary (high school)",
  combined: "Combined (primary and secondary)",
};

export type NewSchool = { name: string; slug: string; stage: SchoolStage };
type Errors<T> = Partial<Record<keyof T, string>>;
export type Parse<T> = { ok: true; value: T } | { ok: false; errors: Errors<T> };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** A slug suggestion from a school name: "St. John's High" to "st-johns-high". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function isSchoolStage(value: unknown): value is SchoolStage {
  return typeof value === "string" && (SCHOOL_STAGES as readonly string[]).includes(value);
}

export function parseNewSchool(form: {
  name: unknown;
  slug: unknown;
  stage: unknown;
}): Parse<NewSchool> {
  const name = text(form.name);
  const slug = text(form.slug).toLowerCase();
  const errors: Errors<NewSchool> = {};

  if (name.length < 3 || name.length > 120)
    errors.name = "Enter the school's name (3 to 120 characters).";
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 40) {
    errors.slug = "Use 3 to 40 lowercase letters, numbers and single hyphens, like msasa-high.";
  }
  if (!isSchoolStage(form.stage)) errors.stage = "Choose primary, secondary or combined.";

  if (Object.keys(errors).length || !isSchoolStage(form.stage)) return { ok: false, errors };
  return { ok: true, value: { name, slug, stage: form.stage } };
}

export type AdminInvite = { fullName: string; email: string };

export function parseAdminInvite(form: { fullName: unknown; email: unknown }): Parse<AdminInvite> {
  const fullName = text(form.fullName);
  const email = typeof form.email === "string" ? normalizeEmail(form.email) : "";
  const errors: Errors<AdminInvite> = {};

  if (fullName.length < 2 || fullName.length > 120)
    errors.fullName = "Enter the admin's full name.";
  if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { fullName, email } };
}

/** Logo uploads: what the `school-branding` bucket accepts (migration school_branding_bucket). */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type LogoCheck = { ok: true; extension: string } | { ok: false; error: string };

export function checkLogoFile(file: { type: string; size: number } | null): LogoCheck {
  if (!file || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  const extension = LOGO_TYPES[file.type as keyof typeof LOGO_TYPES];
  if (!extension) return { ok: false, error: "Upload a PNG, JPEG or WebP image." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "The logo must be 1 MB or smaller." };
  return { ok: true, extension };
}

/**
 * The image type from a file's first bytes. The browser's declared type is
 * only a hint, so uploads are stored with the sniffed type.
 */
export function sniffImageType(bytes: Uint8Array): keyof typeof LOGO_TYPES | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Storage object name for a new logo; unique per upload so browsers never show a stale one. */
export function logoObjectPath(schoolId: string, extension: string, now: Date): string {
  return `${schoolId}/logo-${now.getTime()}.${extension}`;
}
