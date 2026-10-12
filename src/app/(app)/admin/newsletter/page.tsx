import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/people/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { requireArea } from "@/lib/auth/viewer";
import { audienceLabel } from "@/lib/news/input";
import { isExpired, type AnnouncementStatus } from "@/lib/news/visibility";
import { printedDate } from "@/lib/reports/document";
import { createClient } from "@/lib/supabase/server";
import { schoolTimeZone } from "../../news/data";
import { loadAdminAnnouncements, type AdminAnnouncement } from "./data";

export const metadata: Metadata = { title: "Newsletter" };

const SECTIONS: { status: AnnouncementStatus; title: string; empty: string }[] = [
  { status: "published", title: "Published", empty: "Nothing published yet." },
  { status: "draft", title: "Drafts", empty: "No drafts." },
  { status: "archived", title: "Archived", empty: "Nothing archived." },
];

/**
 * The newsletter for school admin and head (US-8.1, US-8.4; D50): every
 * announcement by status, with who it is for and how many of them have
 * read it. Expired ones stay under Published, marked, with their counts.
 */
export default async function NewsletterPage({ searchParams }: PageProps<"/admin/newsletter">) {
  const { school } = await requireArea("newsletter");
  const supabase = await createClient();
  const [announcements, timeZone, { status }] = school
    ? await Promise.all([
        loadAdminAnnouncements(supabase, school.schoolId),
        schoolTimeZone(supabase, school.schoolId),
        searchParams,
      ])
    : [[], undefined, await searchParams];
  const chosen = SECTIONS.find((s) => s.status === status)?.status ?? "published";

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">{school?.schoolName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletter</h1>
        </div>
        <Link
          href="/admin/newsletter/new"
          className={buttonVariants({ className: "h-12 px-5 text-base" })}
        >
          New announcement
        </Link>
      </div>

      <nav aria-label="Status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SECTIONS.map((s) => {
          const count = announcements.filter((a) => a.status === s.status).length;
          const active = s.status === chosen;
          return (
            <Link
              key={s.status}
              href={`/admin/newsletter?status=${s.status}`}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={
                active
                  ? "bg-primary text-primary-foreground border-primary inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium"
                  : "bg-background hover:bg-muted inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium"
              }
            >
              {s.title} ({count})
            </Link>
          );
        })}
      </nav>

      {SECTIONS.filter((s) => s.status === chosen).map((s) => {
        const rows = announcements.filter((a) => a.status === s.status);
        return (
          <section key={s.status} aria-label={s.title} className="flex flex-col gap-3">
            {rows.length === 0 ? (
              <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
                {s.empty}
              </p>
            ) : (
              <ul aria-label={s.title} className="flex flex-col gap-3">
                {rows.map((a) => (
                  <li key={a.id}>
                    <AnnouncementRow a={a} timeZone={timeZone} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}

function AnnouncementRow({ a, timeZone }: { a: AdminAnnouncement; timeZone?: string }) {
  const expired = isExpired({ status: a.status, expiresAt: a.expiresAt });
  return (
    <Link
      href={`/admin/newsletter/${a.id}`}
      className="bg-card hover:bg-muted focus-visible:ring-ring/50 flex flex-col gap-2 rounded-2xl border p-4 shadow-xs outline-none focus-visible:ring-3"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold break-words">{a.title}</span>
        {a.pinned && <StatusPill tone="neutral">Pinned</StatusPill>}
        {expired && <StatusPill tone="muted">Expired</StatusPill>}
      </span>
      <span className="text-muted-foreground text-sm">
        {audienceLabel(a.audience, a.className)}
        {a.publishedAt && ` · Published ${printedDate(a.publishedAt, timeZone)}`}
        {a.expiresAt &&
          !expired &&
          a.status === "published" &&
          ` · Until ${printedDate(new Date(Date.parse(a.expiresAt) - 1).toISOString(), timeZone)}`}
        {a.attachmentCount > 0 &&
          ` · ${a.attachmentCount} ${a.attachmentCount === 1 ? "file" : "files"}`}
      </span>
      {a.status !== "draft" && (
        <span className="text-sm font-medium" data-testid="read-count">
          Read by {a.readCount} of {a.audienceCount}
        </span>
      )}
    </Link>
  );
}
