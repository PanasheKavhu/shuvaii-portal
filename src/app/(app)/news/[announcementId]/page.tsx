import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementArticle } from "@/components/news/announcement-article";
import { requireArea } from "@/lib/auth/viewer";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { loadNewsItem, schoolTimeZone } from "../data";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "News" };

/**
 * One announcement (US-8.2, US-8.3; D50). Once it is on screen the read is
 * recorded (only for someone it is addressed to, once, while it is live)
 * and the unread count refreshes; files open
 * through short signed links. Anything not live and addressed to the viewer
 * is a 404.
 */
export default async function NewsItemPage({ params }: PageProps<"/news/[announcementId]">) {
  const { school } = await requireArea("news");
  const { announcementId } = await params;
  if (!school || !isUuid(announcementId)) notFound();
  const supabase = await createClient();
  const [item, timeZone] = await Promise.all([
    loadNewsItem(supabase, school.schoolId, announcementId),
    schoolTimeZone(supabase, school.schoolId),
  ]);
  if (!item) notFound();

  return (
    <section className="flex flex-col gap-4">
      <Link
        href="/news"
        className="text-primary min-h-11 w-fit py-2 font-medium underline-offset-2 hover:underline"
      >
        ‹ All news
      </Link>
      <AnnouncementArticle announcement={item} timeZone={timeZone} />
      {item.isUnread && <MarkRead announcementId={item.id} />}
    </section>
  );
}
