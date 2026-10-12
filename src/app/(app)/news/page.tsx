import type { Metadata } from "next";
import { NewsList } from "@/components/news/news-list";
import { requireArea } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loadNews, schoolTimeZone } from "./data";

export const metadata: Metadata = { title: "News" };

/**
 * The school's news for staff, parents and learners (US-8.2; D50): what is
 * live and addressed to the viewer, pinned first, then newest first, with
 * unread markers. Expired, draft and archived announcements never appear.
 */
export default async function NewsPage() {
  const { school } = await requireArea("news");
  const supabase = await createClient();
  const [items, timeZone] = school
    ? await Promise.all([
        loadNews(supabase, school.schoolId),
        schoolTimeZone(supabase, school.schoolId),
      ])
    : [[], undefined];
  const unread = items.filter((i) => i.isUnread).length;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-muted-foreground text-sm">{school?.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-muted-foreground" role="status">
          {unread === 0 ? "You are up to date." : `${unread} unread`}
        </p>
      </div>
      <NewsList items={items} timeZone={timeZone} />
    </section>
  );
}
