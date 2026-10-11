/**
 * Report PDFs made per request (US-6.3, US-6.4; D45). A worst-case report
 * draws in about 130 ms, so a batch stays far inside a hosted request's
 * time limit, and a class of 45 takes 12 requests.
 */
export const PDF_BATCH_SIZE = 4;

/** The progress line under the head's PDF bar. Pure. */
export function pdfProgressLine({
  ready,
  total,
  failed,
  working,
}: {
  ready: number;
  total: number;
  failed: number;
  working: boolean;
}): string {
  const of = `${ready} of ${total} report ${total === 1 ? "PDF" : "PDFs"} ready.`;
  if (ready >= total) return of;
  const failures = failed ? ` ${failed} could not be made.` : "";
  if (working) return `Making PDFs: ${of}${failures} Keep this page open.`;
  return failed ? `${of}${failures} Try again to make ${failed === 1 ? "it" : "them"}.` : of;
}
