import type { Metadata } from "next";
import { LatestNews } from "@/components/news/latest-news";
import { PortalHeading } from "@/components/portal/portal-heading";
import { ReportList } from "@/components/portal/report-list";
import { requireArea } from "@/lib/auth/viewer";
import { loadFamilyYears, loadPortalReports } from "@/lib/reports/portal-data";
import { createClient } from "@/lib/supabase/server";
import { loadNewsSummary } from "../news/data";

export const metadata: Metadata = { title: "My reports" };

/**
 * Learner home (US-7.1, US-7.5; D47): their own published reports by year
 * and term, newest first, earlier years included, under the newest unread
 * announcement (D50).
 */
export default async function MyReportsPage() {
  const { viewer, school } = await requireArea("myReports");
  const [reports, years, news] = school
    ? await Promise.all([
        loadPortalReports(school.schoolId),
        loadFamilyYears(school.schoolId),
        loadNewsSummary(await createClient(), school.schoolId),
      ])
    : [[], [], null];

  return (
    <section className="flex flex-col gap-5">
      <PortalHeading
        schoolName={school?.schoolName}
        title="My reports"
        fullName={viewer.fullName}
      />
      {news && <LatestNews summary={news} />}
      <ReportList
        reports={reports.filter((r) => r.is_own)}
        years={years}
        hrefFor={(id) => `/my-reports/${id}`}
        emptyText="No published reports yet. They appear here once the school publishes them."
      />
    </section>
  );
}
