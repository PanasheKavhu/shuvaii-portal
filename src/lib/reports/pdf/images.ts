import type { PdfImage } from "./report-pdf";

/**
 * Images on a report: the logo, stamp and head's signature (PNG, JPEG or
 * WebP, checked by first bytes when uploaded, D15). The PDF library takes
 * PNG and JPEG; WebP is converted to PNG first. Pure.
 */

export type ImageKind = "png" | "jpg" | "webp";

/** The image's format from its first bytes, or null when it is none of the three. */
export function imageKind(bytes: Uint8Array): ImageKind | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/** As react-pdf takes it, once any WebP has been converted to PNG. */
export function pdfImage(bytes: Buffer, kind: Exclude<ImageKind, "webp">): PdfImage {
  return { data: bytes, format: kind };
}
