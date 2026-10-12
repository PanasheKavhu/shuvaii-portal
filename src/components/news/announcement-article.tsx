import { printedDate } from "@/lib/reports/document";
import { AnnouncementBody } from "./announcement-body";

export type ArticleAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type ArticleAnnouncement = {
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
  authorName: string | null;
  attachments: ArticleAttachment[];
};

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const kindLabel = (type: string) => (type === "application/pdf" ? "PDF" : "Image");

/**
 * One announcement as its audience reads it (US-8.2, US-8.3; D50), used by
 * /news/[id] and by the newsletter's preview, so the preview is exactly what
 * the audience sees. Files open through /announcements/attachments/[id],
 * which hands out a short signed link only to someone who may read it.
 */
export function AnnouncementArticle({
  announcement: a,
  timeZone,
}: {
  announcement: ArticleAnnouncement;
  timeZone?: string;
}) {
  return (
    <article
      aria-labelledby="announcement-title"
      className="bg-card flex flex-col gap-5 rounded-3xl border p-5 shadow-xs sm:p-8"
    >
      <header className="flex flex-col gap-2">
        {a.pinned && (
          <span className="bg-brand-accent text-brand-accent-foreground w-fit rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide uppercase">
            Pinned
          </span>
        )}
        <h1
          id="announcement-title"
          className="text-2xl leading-tight font-semibold tracking-tight break-words"
        >
          {a.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {a.publishedAt ? printedDate(a.publishedAt, timeZone) : "Not published yet"}
          {a.authorName && ` · ${a.authorName}`}
        </p>
      </header>
      <AnnouncementBody body={a.body} />
      {a.attachments.length > 0 && (
        <section aria-labelledby="attachments-heading" className="flex flex-col gap-2">
          <h2
            id="attachments-heading"
            className="text-muted-foreground text-sm font-semibold tracking-wide"
          >
            Attachments
          </h2>
          <ul className="flex flex-col gap-2">
            {a.attachments.map((f) => (
              <li key={f.id}>
                <a
                  href={`/announcements/attachments/${f.id}`}
                  target="_blank"
                  rel="noopener"
                  className="bg-background hover:bg-muted focus-visible:ring-ring/50 flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-2 outline-none focus-visible:ring-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{f.filename}</span>
                    <span className="text-muted-foreground text-xs">
                      {kindLabel(f.contentType)} · {sizeLabel(f.sizeBytes)}
                    </span>
                  </span>
                  <span className="text-primary shrink-0 text-sm font-medium">Open</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
