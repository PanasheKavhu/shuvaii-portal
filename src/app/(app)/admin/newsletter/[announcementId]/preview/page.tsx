import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementArticle } from "@/components/news/announcement-article";
import { requireArea } from "@/lib/auth/viewer";
import { audienceInWords } from "@/lib/news/input";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { loadAttachments, schoolTimeZone } from "../../../../news/data";
import { loadAdminAnnouncement } from "../../data";

export const metadata: Metadata = { title: "Preview" };

/**
 * The announcement exactly as its audience will see it on /news (US-8.1;
 * D50): the same component, the same files. A draft shows today's date,
 * as it would if published now.
 */
export default async function PreviewPage({
  params,
}: PageProps<"/admin/newsletter/[announcementId]/preview">) {
  const { school } = await requireArea("newsletter");
  const { announcementId } = await params;
  if (!school || !isUuid(announcementId)) notFound();
  const supabase = await createClient();
  const [a, attachments, timeZone] = await Promise.all([
    loadAdminAnnouncement(supabase, school.schoolId, announcementId),
    loadAttachments(supabase, announcementId),
    schoolTimeZone(supabase, school.schoolId),
  ]);
  if (!a) notFound();

  return (
    <section className="flex flex-col gap-4">
      <Link
        href={`/admin/newsletter/${a.id}`}
        className="text-primary min-h-11 w-fit py-2 font-medium underline-offset-2 hover:underline"
      >
        ‹ Back to editing
      </Link>
      <p role="note" className="bg-brand-accent/15 rounded-xl border px-4 py-3 text-sm font-medium">
        Preview: this is how {audienceInWords(a.audience, a.className)} will see it.
      </p>
      <AnnouncementArticle
        announcement={{
          title: a.title,
          body: a.body,
          pinned: a.pinned,
          publishedAt: a.publishedAt ?? new Date().toISOString(),
          authorName: a.authorName,
          attachments,
        }}
        timeZone={timeZone}
      />
    </section>
  );
}
