import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_URL_SECONDS,
  attachmentFileName,
  attachmentObjectPath,
  checkAttachmentFile,
  sniffAttachmentType,
} from "./attachments";

/**
 * Announcement files in the private `attachments` bucket (US-8.3, D49),
 * always with the signed-in user's own client, so RLS and the bucket's
 * policies decide: only the school's admin or head uploads, and a link is
 * signed only for someone who can read the announcement.
 */

export type AttachOutcome = { ok: true; filename: string } | { ok: false; error: string };

/**
 * Checks the file's size and first bytes, stores it under a safe name with
 * the sniffed type, then records it. If recording fails (a fourth file
 * added at the same moment, say), the stored file is removed again.
 */
export async function addAnnouncementAttachment(
  supabase: SupabaseClient<Database>,
  schoolId: string,
  announcementId: string,
  file: File,
): Promise<AttachOutcome> {
  const { data: existing, error: listError } = await supabase
    .from("announcement_attachments")
    .select("filename")
    .eq("announcement_id", announcementId);
  if (listError) return { ok: false, error: "Could not attach the file. Please try again." };

  const checked = checkAttachmentFile(file, existing.length);
  if (!checked.ok) return checked;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffAttachmentType(bytes);
  if (!type) return { ok: false, error: "Attach a PDF or a PNG, JPEG or WebP image." };

  const filename = uniqueName(
    attachmentFileName(file.name, type),
    existing.map((row) => row.filename),
  );
  const path = attachmentObjectPath(schoolId, announcementId, filename);
  const upload = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false, cacheControl: "0" });
  if (upload.error) return { ok: false, error: "Could not upload the file. Please try again." };

  const { error } = await supabase.from("announcement_attachments").insert({
    school_id: schoolId,
    announcement_id: announcementId,
    path,
    filename,
    content_type: type,
    size_bytes: bytes.byteLength,
  });
  if (error) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    return { ok: false, error: "Could not attach the file. Please try again." };
  }
  return { ok: true, filename };
}

/**
 * A 60-second signed link to an attachment, or null when the caller cannot
 * read it. The row is read first through RLS (which checks the
 * announcement), and the bucket's policy checks again when signing.
 */
export async function attachmentSignedUrl(
  supabase: SupabaseClient<Database>,
  attachmentId: string,
  download = false,
): Promise<string | null> {
  const { data } = await supabase
    .from("announcement_attachments")
    .select("path, filename")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!data) return null;
  const signed = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(
      data.path,
      ATTACHMENT_URL_SECONDS,
      download ? { download: data.filename } : undefined,
    );
  return signed.error ? null : signed.data.signedUrl;
}

/** "notice.pdf", or "notice-2.pdf" when that name is already attached. */
function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
