import Link from "next/link";
import type { NewsSummary } from "@/app/(app)/news/data";

/**
 * The parent and learner home's news hint (US-8.2; D50): the newest unread
 * announcement's title, and how many more are waiting. Nothing when all is
 * read.
 */
export function LatestNews({ summary }: { summary: NewsSummary }) {
  if (summary.unreadCount === 0 || !summary.latestId) return null;
  const more = summary.unreadCount - 1;
  return (
    <section
      aria-labelledby="latest-news-heading"
      className="bg-primary/5 border-primary/30 flex flex-col gap-2 rounded-2xl border p-4"
    >
      <h2
        id="latest-news-heading"
        className="text-primary text-xs font-semibold tracking-widest uppercase"
      >
        New from the school
      </h2>
      <Link
        href={`/news/${summary.latestId}`}
        prefetch={false}
        className="focus-visible:ring-ring/50 -m-1 flex min-h-11 items-center justify-between gap-3 rounded-xl p-1 text-lg leading-snug font-semibold outline-none focus-visible:ring-3"
      >
        <span className="min-w-0 break-words">{summary.latestTitle}</span>
        <span aria-hidden className="text-muted-foreground text-xl">
          ›
        </span>
      </Link>
      {more > 0 && (
        <Link
          href="/news"
          className="text-primary w-fit text-sm font-medium underline-offset-2 hover:underline"
        >
          {more} more unread {more === 1 ? "announcement" : "announcements"}
        </Link>
      )}
    </section>
  );
}
