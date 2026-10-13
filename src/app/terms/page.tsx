import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { termsSections } from "@/lib/privacy/notice";
import { loadNoticeSchools } from "@/lib/privacy/school";

export const metadata: Metadata = { title: "Terms of use" };

/** The public terms of use (Q20; D57). Draft wording, to be reviewed by a lawyer before go-live. */
export default async function TermsPage({ searchParams }: PageProps<"/terms">) {
  const { school: slug } = await searchParams;
  const { school, schools } = await loadNoticeSchools(typeof slug === "string" ? slug : undefined);
  return (
    <LegalPage
      title="Terms of use"
      path="/terms"
      school={school}
      schools={schools}
      sections={termsSections(school)}
    />
  );
}
