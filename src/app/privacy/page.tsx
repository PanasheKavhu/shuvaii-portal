import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { privacySections } from "@/lib/privacy/notice";
import { loadNoticeSchools } from "@/lib/privacy/school";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * The public privacy notice (Q20; D57). `?school=<slug>` fills in that
 * school's data protection contact, which its admin keeps in setup.
 * DATA_REGION names where Supabase stores the data. Draft wording, to be
 * reviewed by a lawyer before go-live.
 */
export default async function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  const { school: slug } = await searchParams;
  const { school, schools } = await loadNoticeSchools(typeof slug === "string" ? slug : undefined);
  return (
    <LegalPage
      title="Privacy notice"
      path="/privacy"
      school={school}
      schools={schools}
      sections={privacySections(school, process.env.DATA_REGION)}
    />
  );
}
