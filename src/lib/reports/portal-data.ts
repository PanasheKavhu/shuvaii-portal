import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readReportDocument, type ReportDocument } from "./document";
import { ensureReportPdf } from "./pdf-files";
import type { EnrolmentYear, PortalReport } from "./portal";
import { portalUrl } from "./portal-url";

/**
 * The portal's reads (SPEC E7; D47), all with the viewer's own client, so
 * the reports policy (published only, the family's own, Q19) decides.
 */

/** Published reports of the viewer's children and of themselves, newest first. */
export async function loadPortalReports(schoolId: string): Promise<PortalReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_reports", { p_school_id: schoolId });
  if (error) throw new Error("Could not load reports");
  return data;
}

/**
 * The years and classes of the viewer's children and themselves, newest
 * first, up to the school's current year (US-3.5, D52), so a new year with
 * no reports yet still shows.
 */
export async function loadFamilyYears(
  schoolId: string,
): Promise<(EnrolmentYear & { learner_id: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("family_enrolment_years", { p_school_id: schoolId });
  if (error) throw new Error("Could not load years");
  return data;
}

export type PortalReportView = {
  id: string;
  document: ReportDocument;
  hasPdf: boolean;
};

/**
 * One published report the viewer may read, from its frozen snapshot, or
 * null. A PDF that publishing left unmade is made now (D48), only after the
 * viewer's own read has found the report.
 */
export async function loadPortalReport(reportId: string): Promise<PortalReportView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, snapshot, pdf_path")
    .eq("id", reportId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error("Could not load the report");
  const document = data ? readReportDocument(data.snapshot) : null;
  if (!data || !document) return null;
  const pdfPath = data.pdf_path ?? (await ensureReportPdf(data.id, await portalUrl()));
  return { id: data.id, document, hasPdf: !!pdfPath };
}

export type ShareLinkRow = { id: string; createdAt: string; expiresAt: string; opens: number };

/** The viewer's own live share links for a report (US-7.3). */
export async function loadMyShareLinks(reportId: string): Promise<ShareLinkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_report_shares", { p_report_id: reportId });
  if (error) throw new Error("Could not load share links");
  return data.map((s) => ({
    id: s.share_id,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    opens: s.opens,
  }));
}
