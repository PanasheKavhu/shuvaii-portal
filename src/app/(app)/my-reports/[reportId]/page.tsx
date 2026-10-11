import type { Metadata } from "next";
import { PortalReportPage } from "@/components/portal/portal-report-page";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Report" };

/** A learner's own published report (US-7.1 to US-7.3; D47). */
export default async function MyReportPage({ params }: PageProps<"/my-reports/[reportId]">) {
  await requireArea("myReports");
  const { reportId } = await params;
  return (
    <PortalReportPage reportId={reportId} back={{ href: "/my-reports", label: "My reports" }} />
  );
}
