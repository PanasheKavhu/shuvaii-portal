import type { Metadata } from "next";
import { PortalHeading } from "@/components/portal/portal-heading";
import { ReportList } from "@/components/portal/report-list";
import { requireArea } from "@/lib/auth/viewer";
import { loadPortalReports } from "@/lib/reports/portal-data";

export const metadata: Metadata = { title: "My reports" };

/**
 * Learner home (US-7.1, US-7.5; D47): their own published reports by year
 * and term, newest first, earlier years included.
 */
export default async function MyReportsPage() {
  const { viewer, school } = await requireArea("myReports");
  const reports = school ? await loadPortalReports(school.schoolId) : [];

  return (
    <section className="flex flex-col gap-5">
      <PortalHeading
        schoolName={school?.schoolName}
        title="My reports"
        fullName={viewer.fullName}
      />
      <ReportList
        reports={reports.filter((r) => r.is_own)}
        hrefFor={(id) => `/my-reports/${id}`}
        emptyText="No published reports yet. They appear here once the school publishes them."
      />
    </section>
  );
}
