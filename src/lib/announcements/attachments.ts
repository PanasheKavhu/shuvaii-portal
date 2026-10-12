import { sniffImageType } from "@/lib/platform/school-input";

/**
 * Announcement attachments (US-8.3, D49): what the `attachments` bucket and
 * the announcement_attachments table accept (migration announcements).
 * Pure, so the rules are unit tested; the upload and the signed link are in
 * attachment-files.ts.
 */

export const ATTACHMENTS_BUCKET = "attachments";
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 3;
/** Signed links last a minute: enough to open or download, too short to pass around. */
export const ATTACHMENT_URL_SECONDS = 60;

export const ATTACHMENT_TYPES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type AttachmentType = keyof typeof ATTACHMENT_TYPES;

export type AttachmentCheck = { ok: true } | { ok: false; error: string };

export function checkAttachmentFile(
  file: { size: number } | null,
  existingCount: number,
): AttachmentCheck {
  if (existingCount >= ATTACHMENT_MAX_COUNT) {
    return { ok: false, error: `An announcement can have at most ${ATTACHMENT_MAX_COUNT} files.` };
  }
  if (!file || file.size === 0) return { ok: false, error: "Choose a file to attach." };
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "Each file must be 5 MB or smaller." };
  }
  return { ok: true };
}

/**
 * The file's type from its first bytes: a PDF, or a PNG, JPEG or WebP
 * image. The browser's declared type and the file name are only hints, so
 * uploads are stored with the sniffed type (as logos are, D15).
 */
export function sniffAttachmentType(bytes: Uint8Array): AttachmentType | null {
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  if (pdf.every((b, i) => bytes[i] === b)) return "application/pdf";
  return sniffImageType(bytes);
}

/**
 * A safe stored name from the uploaded one, any folder part dropped:
 * letters, digits, dots, dashes and underscores, starting with a letter or
 * digit, at most 100 characters, ending in the extension of the sniffed type
 * (whatever the original said).
 * Matches private.announcement_attachment_type() in the database.
 */
export function attachmentFileName(original: string, type: AttachmentType): string {
  const extension = ATTACHMENT_TYPES[type];
  const base = (original.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80)
    .replace(/[-_]+$/, "");
  return `${base || "file"}.${extension}`;
}

/** Storage object name: {school_id}/{announcement_id}/{filename}. */
export function attachmentObjectPath(
  schoolId: string,
  announcementId: string,
  filename: string,
): string {
  return `${schoolId}/${announcementId}/${filename}`;
}
