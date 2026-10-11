import type { Metadata } from "next";
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
  const firstName = viewer.fullName.split(" ")[0];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-muted-foreground text-sm">{school?.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">My reports</h1>
        <p className="text-muted-foreground">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</p>
      </div>
      <ReportList
        reports={reports.filter((r) => r.is_own)}
        hrefFor={(id) => `/my-reports/${id}`}
        emptyText="No published reports yet. They appear here once the school publishes them."
      />
    </section>
  );
}
