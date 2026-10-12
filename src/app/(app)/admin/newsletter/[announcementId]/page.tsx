import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementForm } from "@/components/news/announcement-form";
import { AttachmentUpload } from "@/components/news/attachment-upload";
import { StatusPill } from "@/components/people/status-pill";
import { ActionForm } from "@/components/setup/action-form";
import { buttonVariants } from "@/components/ui/button";
import { requireArea } from "@/lib/auth/viewer";
import { audienceInWords } from "@/lib/news/input";
import { isExpired, lastDayShown } from "@/lib/news/visibility";
import { printedDate } from "@/lib/reports/document";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { loadAttachments, schoolTimeZone } from "../../../news/data";
import {
  archiveAnnouncement,
  attachFile,
  publishAnnouncement,
  removeFile,
  saveAnnouncement,
} from "../actions";
import { loadAdminAnnouncement, loadAudienceClasses } from "../data";

export const metadata: Metadata = { title: "Announcement" };

const STATUS_LABEL = { draft: "Draft", published: "Published", archived: "Archived" } as const;

/** What the last step did, after its redirect here. */
const DONE: Record<string, string> = {
  saved: "Draft saved. Add files, preview it, then publish.",
  published: "Published. Its audience can read it now.",
  archived: "Archived. Its audience no longer sees it.",
};

/**
 * One announcement for school admin and head (US-8.1 to US-8.4; D50): edit
 * it (draft or published), add or remove files, preview it as its audience
 * sees it, publish it, or archive it. An archived one is read only until
 * published again.
 */
export default async function AnnouncementPage({
  params,
  searchParams,
}: PageProps<"/admin/newsletter/[announcementId]">) {
  const { school } = await requireArea("newsletter");
  const { announcementId } = await params;
  if (!school || !isUuid(announcementId)) notFound();
  const supabase = await createClient();
  const [a, classes, attachments, timeZone, { done }] = await Promise.all([
    loadAdminAnnouncement(supabase, school.schoolId, announcementId),
    loadAudienceClasses(supabase, school.schoolId),
    loadAttachments(supabase, announcementId),
    schoolTimeZone(supabase, school.schoolId),
    searchParams,
  ]);
  if (!a) notFound();
  const expired = isExpired({ status: a.status, expiresAt: a.expiresAt });
  const editable = a.status !== "archived";

  return (
    <section className="flex flex-col gap-5">
      <Link
        href={`/admin/newsletter?status=${a.status}`}
        className="text-primary min-h-11 w-fit py-2 font-medium underline-offset-2 hover:underline"
      >
        ‹ Newsletter
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={a.status === "published" ? "good" : a.status === "draft" ? "warn" : "muted"}
          >
            {STATUS_LABEL[a.status]}
          </StatusPill>
          {expired && <StatusPill tone="muted">Expired</StatusPill>}
          {a.pinned && <StatusPill tone="neutral">Pinned</StatusPill>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{a.title}</h1>
        <p className="text-muted-foreground text-sm">
          For {audienceInWords(a.audience, a.className)}
          {a.publishedAt && ` · Published ${printedDate(a.publishedAt, timeZone)}`}
          {a.expiresAt &&
            ` · Shown until ${printedDate(new Date(Date.parse(a.expiresAt) - 1).toISOString(), timeZone)}`}
        </p>
        {a.status !== "draft" && (
          <p className="font-medium" data-testid="read-count">
            Read by {a.readCount} of {a.audienceCount}
          </p>
        )}
        {typeof done === "string" && DONE[done] && (
          <p
            role="status"
            className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
          >
            {DONE[done]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/newsletter/${a.id}/preview`}
          className={buttonVariants({ variant: "outline", className: "h-12 px-5 text-base" })}
        >
          Preview
        </Link>
        {a.status !== "published" && (
          <ActionForm
            action={publishAnnouncement.bind(null, a.id)}
            submitLabel={a.status === "archived" ? "Publish again" : "Publish"}
            pendingLabel="Publishing…"
            label="Publish"
            className="sm:min-w-40"
          />
        )}
        {a.status !== "archived" && (
          <ActionForm
            action={archiveAnnouncement.bind(null, a.id)}
            submitLabel="Archive"
            pendingLabel="Archiving…"
            submitVariant="outline"
            label="Archive"
            className="sm:min-w-40"
          />
        )}
      </div>

      {editable ? (
        <div className="bg-card rounded-3xl border p-5 shadow-xs sm:p-8">
          <h2 className="mb-4 text-lg font-semibold">Edit</h2>
          {a.status === "published" && (
            <p className="text-muted-foreground mb-4 text-sm">
              Changes show to its audience as soon as you save. The audit log keeps the earlier
              text.
            </p>
          )}
          <AnnouncementForm
            key={a.id}
            action={saveAnnouncement.bind(null, a.id)}
            values={{
              title: a.title,
              body: a.body,
              audience: a.audience,
              classId: a.classId,
              pinned: a.pinned,
              expiresOn: a.expiresAt ? lastDayShown(a.expiresAt, timeZone) : "",
            }}
            classes={classes}
            submitLabel="Save changes"
          />
        </div>
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          Archived announcements cannot be changed. Publish it again to edit it.
        </p>
      )}

      <section
        aria-labelledby="files-heading"
        className="bg-card flex flex-col gap-4 rounded-3xl border p-5 shadow-xs sm:p-8"
      >
        <h2 id="files-heading" className="text-lg font-semibold">
          Files
        </h2>
        {attachments.length > 0 && (
          <ul aria-label="Attached files" className="flex flex-col gap-2">
            {attachments.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2"
              >
                <a
                  href={`/announcements/attachments/${f.id}`}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 truncate font-medium underline-offset-2 hover:underline"
                >
                  {f.filename}
                </a>
                {editable && (
                  <ActionForm
                    action={removeFile.bind(null, a.id, f.id)}
                    submitLabel={`Remove ${f.filename}`}
                    pendingLabel="Removing…"
                    submitVariant="outline"
                    label={`Remove ${f.filename}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <AttachmentUpload
            action={attachFile.bind(null, a.id)}
            existingCount={attachments.length}
          />
        )}
      </section>
    </section>
  );
}
