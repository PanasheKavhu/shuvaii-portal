import type { Metadata } from "next";
import { PortalReportPage } from "@/components/portal/portal-report-page";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Report" };

/** A child's published report for a parent (US-7.1 to US-7.3; D47). */
export default async function ChildReportPage({
  params,
}: PageProps<"/children/reports/[reportId]">) {
  await requireArea("children");
  const { reportId } = await params;
  return (
    <PortalReportPage reportId={reportId} back={{ href: "/children", label: "My children" }} />
  );
}
