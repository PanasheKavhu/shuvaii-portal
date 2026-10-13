import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PrivacyContactForm } from "../../../platform/schools/[id]/privacy-contact-form";
import { requireSchoolAdmin } from "../data";
import { saveSchoolPrivacyContact } from "./actions";

export const metadata: Metadata = { title: "Privacy contact" };

/**
 * Who answers data protection questions for the school (Q20; D57). The
 * public privacy notice names them; the platform admin may fill it in at
 * onboarding, and the school admin keeps it up to date here.
 */
export default async function PrivacyContactPage() {
  const { schoolId, schoolName } = await requireSchoolAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .select("slug, privacy_contact_name, privacy_contact_email")
    .eq("id", schoolId)
    .single();
  if (error) throw new Error("Could not load the privacy contact");

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin/setup" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School setup
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Privacy contact</h1>
      </div>
      <p className="text-muted-foreground">
        The person or office parents, learners and staff write to about their data. The{" "}
        <Link
          href={`/privacy?school=${encodeURIComponent(data.slug)}`}
          className="underline underline-offset-4"
        >
          privacy notice
        </Link>{" "}
        shows this name and email address to anyone.
      </p>
      <div className="bg-card rounded-2xl border p-4">
        <PrivacyContactForm
          action={saveSchoolPrivacyContact}
          name={data.privacy_contact_name ?? ""}
          email={data.privacy_contact_email ?? ""}
        />
      </div>
    </section>
  );
}
