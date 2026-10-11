import "server-only";

/**
 * Report files in Supabase Storage (D43). Both buckets are private.
 *
 * - `reports`: published PDFs at {school_id}/{report_id}/v{version}.pdf,
 *   written only by the server (service role). Read through a short signed
 *   URL made with the viewer's own client (the PDF route) or by the
 *   server for a live share link, so the bucket's policy (the
 *   viewer can read the report whose pdf_path it is) decides.
 * - `report-assets`: the stamp and head's signature, uploaded by the school
 *   admin, read only by report rendering (service role).
 */

export const REPORTS_BUCKET = "reports";
export const REPORT_ASSETS_BUCKET = "report-assets";

/** Signed PDF links last a minute: enough to open or download, too short to pass around. */
export const PDF_URL_SECONDS = 60;
