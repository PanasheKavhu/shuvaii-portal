import { NextResponse } from "next/server";
import { reportFileName } from "@/lib/reports/portal";
import { PDF_URL_SECONDS, REPORTS_BUCKET } from "@/lib/reports/storage";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a report's PDF (US-6.4, D45): a redirect to a 60-second signed URL
 * made with the viewer's own client, so the reports' RLS and the bucket's
 * policy decide who may open it. The school still opens a withdrawn
 * version's PDF (from the audit screen, US-6.6, D46); parents and learners
 * cannot read withdrawn reports, so they open only the newest published
 * one. Anyone else, and a report without a PDF yet, gets 404. With
 * `?download=1` the file is saved as `report-<reference>.pdf` rather than
 * opened (US-7.2, D47); either way the stored file is served, never made
 * again.
 */
export async function GET(request: Request, ctx: RouteContext<"/reports/[reportId]/pdf">) {
  const { reportId } = await ctx.params;
  const notFound = new NextResponse("Not found", { status: 404 });
  if (!isUuid(reportId)) return notFound;
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("pdf_path, reference_code")
    .eq("id", reportId)
    .in("status", ["published", "withdrawn"])
    .maybeSingle();
  if (!data?.pdf_path) return notFound;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(
      data.pdf_path,
      PDF_URL_SECONDS,
      download ? { download: reportFileName(data.reference_code) } : undefined,
    );
  if (error || !signed) return notFound;
  return NextResponse.redirect(signed.signedUrl, { status: 303 });
}
