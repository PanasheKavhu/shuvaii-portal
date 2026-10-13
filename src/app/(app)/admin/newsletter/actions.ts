"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addAnnouncementAttachment } from "@/lib/announcements/attachment-files";
import { ATTACHMENTS_BUCKET } from "@/lib/announcements/attachments";
import { getActiveSchool, getViewer } from "@/lib/auth/viewer";
import { dbErrorMessage } from "@/lib/db-errors";
import { todayIn } from "@/lib/marks/terms";
import { parseAnnouncementInput } from "@/lib/news/input";
import { lastDayShown } from "@/lib/news/visibility";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, notAllowed, saved, type FormState } from "../../platform/form-state";
import { schoolTimeZone } from "../../news/data";

/**
 * The newsletter's writes (US-8.1 to US-8.4; D50), for the school's admin
 * and head. Saving, publishing and archiving go through the database
 * functions, which check the role and the state again; attachments through
 * addAnnouncementAttachment() (D49). All with the signed-in user's client,
 * so RLS applies and every change is audited.
 */

const NOT_ALLOWED = notAllowed("the school admin or head");
const LIST = "/admin/newsletter";

async function writerContext(): Promise<{ schoolId: string } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const school = await getActiveSchool(viewer);
  // A school with the newsletter switched off writes nothing (D55); the
  // database refuses it too.
  return school &&
    school.features.newsletter &&
    (school.roles.includes("school_admin") || school.roles.includes("head"))
    ? { schoolId: school.schoolId }
    : null;
}

const messages = (fallback: string) => ({ notAllowed: NOT_ALLOWED.message!, fallback });

function refresh(announcementId?: string) {
  revalidatePath(LIST);
  if (announcementId) revalidatePath(`${LIST}/${announcementId}`);
  revalidatePath("/news", "layout");
}

/**
 * Saves the form: a new draft (then opens it, where files can be added), or
 * the edits to a draft or published announcement.
 */
export async function saveAnnouncement(
  announcementId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await writerContext();
  if (!ctx || (announcementId !== null && !isUuid(announcementId))) return NOT_ALLOWED;
  const supabase = await createClient();
  const timeZone = await schoolTimeZone(supabase, ctx.schoolId);

  let savedExpiresOn: string | null = null;
  if (announcementId) {
    const { data } = await supabase
      .from("announcements")
      .select("expires_at")
      .eq("id", announcementId)
      .maybeSingle();
    savedExpiresOn = data?.expires_at ? lastDayShown(data.expires_at, timeZone) : null;
  }
  const parsed = parseAnnouncementInput(
    {
      title: formData.get("title"),
      body: formData.get("body"),
      audience: formData.get("audience"),
      classId: formData.get("classId"),
      pinned: formData.get("pinned"),
      expiresOn: formData.get("expiresOn"),
    },
    { today: todayIn(timeZone), timeZone, savedExpiresOn },
  );
  if (!parsed.ok) return failed("Check the announcement.", parsed.errors);
  const v = parsed.value;

  const { data: id, error } = await supabase.rpc("save_announcement", {
    p_school_id: ctx.schoolId,
    p_announcement_id: announcementId ?? undefined,
    p_title: v.title,
    p_body: v.body,
    p_audience: v.audience,
    p_class_id: v.classId ?? undefined,
    p_pinned: v.pinned,
    p_expires_at: v.expiresAt ?? undefined,
  });
  if (error || !id) {
    return failed(
      error
        ? dbErrorMessage(error, messages("Could not save the announcement. Please try again."))
        : "Could not save the announcement. Please try again.",
    );
  }
  refresh(id);
  if (!announcementId) redirect(`${LIST}/${id}?done=saved`);
  return saved("Changes saved.");
}

export async function publishAnnouncement(announcementId: string): Promise<FormState> {
  const ctx = await writerContext();
  if (!ctx || !isUuid(announcementId)) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_announcement", {
    p_announcement_id: announcementId,
  });
  if (error) {
    return failed(dbErrorMessage(error, messages("Could not publish it. Please try again.")));
  }
  refresh(announcementId);
  // The publish button goes once it is published, so the page says it.
  redirect(`${LIST}/${announcementId}?done=published`);
}

export async function archiveAnnouncement(announcementId: string): Promise<FormState> {
  const ctx = await writerContext();
  if (!ctx || !isUuid(announcementId)) return NOT_ALLOWED;
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_announcement", {
    p_announcement_id: announcementId,
  });
  if (error) {
    return failed(dbErrorMessage(error, messages("Could not archive it. Please try again.")));
  }
  refresh(announcementId);
  redirect(`${LIST}/${announcementId}?done=archived`);
}

/** Adds one file (US-8.3): checked by size and first bytes, at most 3. */
export async function attachFile(
  announcementId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await writerContext();
  if (!ctx || !isUuid(announcementId)) return NOT_ALLOWED;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return failed(null, { file: "Choose a file to attach." });
  const outcome = await addAnnouncementAttachment(
    await createClient(),
    ctx.schoolId,
    announcementId,
    file,
  );
  if (!outcome.ok) return failed(null, { file: outcome.error });
  refresh(announcementId);
  return saved(`Attached ${outcome.filename}.`);
}

/** Removes a file: the row first (audited), then the stored file, which the bucket allows once no row points at it. */
export async function removeFile(announcementId: string, attachmentId: string): Promise<FormState> {
  const ctx = await writerContext();
  if (!ctx || !isUuid(announcementId) || !isUuid(attachmentId)) return NOT_ALLOWED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcement_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("announcement_id", announcementId)
    .select("path, filename");
  if (error || data.length !== 1) return failed("Could not remove the file. Please try again.");
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([data[0]!.path]);
  refresh(announcementId);
  return saved(`Removed ${data[0]!.filename}.`);
}
