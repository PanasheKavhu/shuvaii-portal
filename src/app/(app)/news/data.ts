import "server-only";

import type { ArticleAttachment } from "@/components/news/announcement-article";
import type { NewsListItem } from "@/components/news/news-list";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the news pages and the unread hints (US-8.2; D50), through the
 * signed-in user's client: my_news() returns only live announcements
 * addressed to the caller, so the policies of D49 decide what anyone sees.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

/** The school's time zone for dates, Harare when it cannot be read. */
export async function schoolTimeZone(supabase: Client, schoolId: string): Promise<string> {
  const { data } = await supabase
    .from("schools")
    .select("timezone")
    .eq("id", schoolId)
    .maybeSingle();
  return data?.timezone ?? "Africa/Harare";
}

export async function loadNews(supabase: Client, schoolId: string): Promise<NewsListItem[]> {
  const rows = rowsOrThrow(
    await supabase.rpc("my_news", { p_school_id: schoolId }),
    "news",
    "Could not load the news",
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    publishedAt: r.published_at,
    isUnread: r.is_unread,
    attachmentCount: r.attachment_count,
  }));
}

/** One live announcement addressed to the caller, with its files, or null. */
export async function loadNewsItem(supabase: Client, schoolId: string, announcementId: string) {
  const { data, error } = await supabase
    .rpc("my_news", { p_school_id: schoolId })
    .eq("id", announcementId)
    .maybeSingle();
  if (error) throw new Error("Could not load the announcement");
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    body: data.body,
    pinned: data.pinned,
    publishedAt: data.published_at,
    authorName: data.author_name,
    isUnread: data.is_unread,
    attachments: await loadAttachments(supabase, data.id),
  };
}

export async function loadAttachments(
  supabase: Client,
  announcementId: string,
): Promise<ArticleAttachment[]> {
  const rows = rowsOrThrow(
    await supabase
      .from("announcement_attachments")
      .select("id, filename, content_type, size_bytes")
      .eq("announcement_id", announcementId)
      .order("created_at"),
    "news attachments",
    "Could not load the attachments",
  );
  return rows.map((f) => ({
    id: f.id,
    filename: f.filename,
    contentType: f.content_type,
    sizeBytes: f.size_bytes,
  }));
}

export type NewsSummary = {
  unreadCount: number;
  latestId: string | null;
  latestTitle: string | null;
};

/** The unread count and newest unread title, for the menu and the parent and learner home. */
export async function loadNewsSummary(supabase: Client, schoolId: string): Promise<NewsSummary> {
  const { data } = await supabase.rpc("my_news_summary", { p_school_id: schoolId }).maybeSingle();
  return {
    unreadCount: data?.unread_count ?? 0,
    latestId: data?.latest_id ?? null,
    latestTitle: data?.latest_title ?? null,
  };
}
