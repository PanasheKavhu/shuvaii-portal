import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { verifyUrl, type ReportDocument } from "../document";
import { FONT_FAMILY, ReportPdf, type QrMatrix, type ReportImages } from "./report-pdf";

/**
 * Renders a report document to PDF bytes with @react-pdf/renderer (D45):
 * no headless browser. The font is Noto Sans (SIL Open Font License,
 * fonts/OFL.txt), embedded in every PDF. Given the same document, images
 * and portal address the bytes are the same every time.
 */

/** Where the font files are; next.config.ts traces them into the server bundle. */
export const FONT_DIR = path.join(process.cwd(), "src/lib/reports/pdf/fonts");

let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // Wrap at spaces only: names and comments are never split with a hyphen.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

/** The QR code for a URL, medium error correction so a scuffed print still scans. */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: (row, col) => modules.get(row, col) === 1 };
}

export async function renderReportPdf(
  doc: ReportDocument,
  images: ReportImages,
  portalUrl: string,
): Promise<Buffer> {
  registerFonts();
  const url = verifyUrl(portalUrl, doc.verificationCode);
  // Called as a function so the renderer gets the <Document> element itself.
  return renderToBuffer(ReportPdf({ doc, images, verifyUrl: url, qr: qrMatrix(url) }));
}
