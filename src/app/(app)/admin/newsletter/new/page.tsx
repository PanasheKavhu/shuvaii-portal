import type { Metadata } from "next";
import Link from "next/link";
import { AnnouncementForm } from "@/components/news/announcement-form";
import { requireArea } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { saveAnnouncement } from "../actions";
import { loadAudienceClasses } from "../data";

export const metadata: Metadata = { title: "New announcement" };

/** Writing a new announcement (US-8.1; D50): saved as a draft first, then files, preview and publish. */
export default async function NewAnnouncementPage() {
  const { school } = await requireArea("newsletter");
  const classes = school ? await loadAudienceClasses(await createClient(), school.schoolId) : [];
  return (
    <section className="flex flex-col gap-5">
      <Link
        href="/admin/newsletter"
        className="text-primary min-h-11 w-fit py-2 font-medium underline-offset-2 hover:underline"
      >
        ‹ Newsletter
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New announcement</h1>
        <p className="text-muted-foreground">
          It is saved as a draft. You can add files and preview it before publishing.
        </p>
      </div>
      <div className="bg-card rounded-3xl border p-5 shadow-xs sm:p-8">
        <AnnouncementForm
          action={saveAnnouncement.bind(null, null)}
          values={{
            title: "",
            body: "",
            audience: "all",
            classId: null,
            pinned: false,
            expiresOn: "",
          }}
          classes={classes}
          submitLabel="Save draft"
        />
      </div>
    </section>
  );
}
