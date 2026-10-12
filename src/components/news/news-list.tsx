import Link from "next/link";
import { excerpt } from "@/lib/news/links";
import { printedDate } from "@/lib/reports/document";
import { cn } from "@/lib/utils";

export type NewsListItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
  isUnread: boolean;
  attachmentCount: number;
};

/**
 * The news feed (US-8.2; D50): pinned first, then newest first, as the
 * database orders it. Unread ones carry a dot and the word "Unread" for
 * screen readers. Links are not prefetched, since opening one marks it read.
 */
export function NewsList({
  items,
  timeZone,
}: {
  items: readonly NewsListItem[];
  timeZone?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
        No news right now. Announcements from the school appear here.
      </p>
    );
  }
  return (
    <ul aria-label="Announcements" className="flex flex-col gap-3">
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={`/news/${n.id}`}
            prefetch={false}
            data-unread={n.isUnread || undefined}
            className={cn(
              "bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-20 gap-3 rounded-2xl border p-4 shadow-xs outline-none focus-visible:ring-3",
              n.isUnread && "border-primary/40",
            )}
          >
            <span className="mt-1.5 flex w-2.5 shrink-0 justify-center">
              {n.isUnread && <span aria-hidden className="bg-primary size-2.5 rounded-full" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                {n.isUnread && <span className="sr-only">Unread: </span>}
                <span className={cn("break-words", n.isUnread ? "font-semibold" : "font-medium")}>
                  {n.title}
                </span>
                {n.pinned && (
                  <span className="bg-brand-accent text-brand-accent-foreground rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase">
                    Pinned
                  </span>
                )}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-sm break-words">
                {excerpt(n.body)}
              </span>
              <span className="text-muted-foreground text-xs">
                {n.publishedAt && printedDate(n.publishedAt, timeZone)}
                {n.attachmentCount > 0 &&
                  ` · ${n.attachmentCount} ${n.attachmentCount === 1 ? "file" : "files"}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
