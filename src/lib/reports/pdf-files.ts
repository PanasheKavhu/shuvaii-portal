import "server-only";

import { BRANDING_BUCKET } from "@/lib/branding/theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { readReportDocument, type ReportDocument } from "./document";
import { PDF_BATCH_SIZE } from "./pdf-progress";
import { imageKind, pdfImage } from "./pdf/images";
import { renderReportPdf } from "./pdf/render";
import type { PdfImage, ReportImages } from "./pdf/report-pdf";
import { REPORT_ASSETS_BUCKET, REPORTS_BUCKET } from "./storage";
import { reportPdfPath } from "./templates";

/**
 * Making and storing published reports' PDFs (US-6.3, US-6.4; D45). Each
 * PDF is drawn once from the report's frozen snapshot and stored in the
 * private `reports` bucket at {school_id}/{report_id}/v{version}.pdf; then
 * `pdf_path` is set, which the database allows once on a published report
 * and only for the server. Runs with the service role, so callers check
 * first that the signed-in user is the head of the report's school.
 *
 * A class is done a few reports at a time (PDF_BATCH_SIZE per request), so
 * a class of 45 never runs into a hosted request's time limit. A failed
 * PDF simply stays without a path and is tried again from the same
 * snapshot, which always gives the same file, so retrying is safe.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type PdfReport = {
  id: string;
  schoolId: string;
  version: number;
  snapshot: unknown;
};

async function download(admin: AdminClient, bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`could not read ${bucket} image`);
  return Buffer.from(await data.arrayBuffer());
}

/** An image ready for the PDF; WebP becomes PNG. Throws when it cannot be read. */
async function loadImage(admin: AdminClient, bucket: string, path: string): Promise<PdfImage> {
  const bytes = await download(admin, bucket, path);
  const kind = imageKind(bytes);
  if (kind === "png" || kind === "jpg") return pdfImage(bytes, kind);
  if (kind === "webp") {
    // sharp comes with Next.js for image optimisation (D45).
    const sharp = (await import("sharp")).default;
    return pdfImage(await sharp(bytes).png().toBuffer(), "png");
  }
  throw new Error("unsupported image");
}

/**
 * The images a report prints. A missing image (none set, or switched off)
 * is null; an image that is set but cannot be read throws, so the PDF is
 * retried rather than made without it.
 */
export async function loadReportImages(
  admin: AdminClient,
  doc: ReportDocument,
  cache = new Map<string, Promise<PdfImage>>(),
): Promise<ReportImages> {
  const get = (bucket: string, path: string | null) => {
    if (!path) return null;
    const key = `${bucket}/${path}`;
    if (!cache.has(key)) cache.set(key, loadImage(admin, bucket, path));
    return cache.get(key)!;
  };
  const [logo, stamp, headSignature] = await Promise.all([
    get(BRANDING_BUCKET, doc.school.logoPath),
    get(REPORT_ASSETS_BUCKET, doc.school.stampPath),
    get(REPORT_ASSETS_BUCKET, doc.school.headSignaturePath),
  ]);
  return { logo, stamp, headSignature };
}

/** Draws one report's PDF from its snapshot, stores it and records its path. */
export async function storeReportPdf(
  admin: AdminClient,
  report: PdfReport,
  portalUrl: string,
  cache?: Map<string, Promise<PdfImage>>,
): Promise<void> {
  const doc = readReportDocument(report.snapshot);
  if (!doc) throw new Error("the report has no published snapshot");
  const images = await loadReportImages(admin, doc, cache);
  const pdf = await renderReportPdf(doc, images, portalUrl);
  const path = reportPdfPath(report.schoolId, report.id, report.version);
  // Upsert: a retry after a stored file but a failed update writes the same bytes again.
  // max-age=0: Storage's default (an hour) would keep a private report in a
  // shared device's or proxy's cache long after its 60-second link expired.
  const upload = await admin.storage
    .from(REPORTS_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true, cacheControl: "0" });
  if (upload.error) throw new Error("could not store the PDF");
  const { error } = await admin
    .from("reports")
    .update({ pdf_path: path })
    .eq("id", report.id)
    .eq("status", "published")
    .is("pdf_path", null);
  if (error) throw new Error("could not record the PDF");
}

export type PdfBatchResult = {
  /** Reports whose PDF this batch made. */
  made: string[];
  /** Reports whose PDF failed in this batch; the caller skips them until asked to retry. */
  failed: string[];
  /** Published reports of the class and term, and how many of them have their PDF. */
  total: number;
  ready: number;
};

/**
 * The next few published reports of a class and term without a PDF (leaving
 * out `skip`), made one after another. The caller has checked that the
 * signed-in user is the head of `schoolId`.
 */
export async function makeClassPdfBatch(
  schoolId: string,
  classId: string,
  termId: string,
  skip: readonly string[],
  portalUrl: string,
): Promise<PdfBatchResult> {
  const admin = createAdminClient();
  const published = await admin
    .from("reports")
    .select("id, school_id, version, pdf_path, enrolments!inner(class_id)")
    .eq("school_id", schoolId)
    .eq("term_id", termId)
    .eq("enrolments.class_id", classId)
    .eq("status", "published")
    .order("id");
  if (published.error) throw new Error("could not load the reports");

  const waiting = published.data.filter((r) => !r.pdf_path && !skip.includes(r.id));
  const batch = waiting.slice(0, PDF_BATCH_SIZE);
  const made: string[] = [];
  const failed: string[] = [];
  const cache = new Map<string, Promise<PdfImage>>();
  if (batch.length > 0) {
    const snapshots = await admin
      .from("reports")
      .select("id, snapshot")
      .in(
        "id",
        batch.map((r) => r.id),
      );
    if (snapshots.error) throw new Error("could not load the reports");
    const snapshotOf = new Map(snapshots.data.map((r) => [r.id, r.snapshot]));
    for (const r of batch) {
      try {
        await storeReportPdf(
          admin,
          { id: r.id, schoolId: r.school_id, version: r.version, snapshot: snapshotOf.get(r.id) },
          portalUrl,
          cache,
        );
        made.push(r.id);
      } catch (e) {
        // No learner details in logs (rule 5): the report id is enough to find it.
        console.error(`report PDF failed for report ${r.id}: ${(e as Error)?.message}`);
        failed.push(r.id);
      }
    }
  }
  const ready = published.data.filter((r) => r.pdf_path).length + made.length;
  return { made, failed, total: published.data.length, ready };
}
