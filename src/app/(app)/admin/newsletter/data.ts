import "server-only";

import type { Audience } from "@/lib/news/input";
import type { AnnouncementStatus } from "@/lib/news/visibility";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the newsletter (US-8.1 to US-8.4; D50). School admin and head
 * read every announcement of their school through RLS (D49); read counts
 * come from announcement_read_counts(), numbers only.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  classId: string | null;
  className: string | null;
  pinned: boolean;
  status: AnnouncementStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  isLive: boolean;
  authorName: string | null;
  attachmentCount: number;
  readCount: number;
  audienceCount: number;
};

export async function loadAdminAnnouncements(
  supabase: Client,
  schoolId: string,
): Promise<AdminAnnouncement[]> {
  const [rows, counts] = await Promise.all([
    supabase.rpc("my_announcements", { p_school_id: schoolId }),
    supabase.rpc("announcement_read_counts", { p_school_id: schoolId }),
  ]);
  const announcements = rowsOrThrow(rows, "newsletter", "Could not load the announcements");
  const byId = new Map(
    rowsOrThrow(counts, "newsletter counts", "Could not load the read counts").map((c) => [
      c.announcement_id,
      c,
    ]),
  );
  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience,
    classId: a.class_id,
    className: a.class_name,
    pinned: a.pinned,
    status: a.status,
    publishedAt: a.published_at,
    expiresAt: a.expires_at,
    isLive: a.is_live,
    authorName: a.author_name,
    attachmentCount: a.attachment_count,
    readCount: byId.get(a.id)?.read_count ?? 0,
    audienceCount: byId.get(a.id)?.audience_count ?? 0,
  }));
}

export async function loadAdminAnnouncement(
  supabase: Client,
  schoolId: string,
  announcementId: string,
): Promise<AdminAnnouncement | null> {
  const all = await loadAdminAnnouncements(supabase, schoolId);
  return all.find((a) => a.id === announcementId) ?? null;
}

/** The classes a class announcement can go to: this year's, by name. */
export async function loadAudienceClasses(
  supabase: Client,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = rowsOrThrow(
    await supabase
      .from("classes")
      .select("id, name, academic_years!inner(is_current)")
      .eq("school_id", schoolId)
      .eq("academic_years.is_current", true)
      .order("name"),
    "newsletter classes",
    "Could not load the classes",
  );
  return rows.map((c) => ({ id: c.id, name: c.name }));
}
