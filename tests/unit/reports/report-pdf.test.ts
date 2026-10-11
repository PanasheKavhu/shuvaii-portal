// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { readReportDocument, type ReportDocument } from "@/lib/reports/document";
import { qrMatrix, renderReportPdf } from "@/lib/reports/pdf/render";
import {
  NO_IMAGES,
  PLATFORM_FOOTER,
  longestGrade,
  pageLineName,
  subjectColumns,
  type ReportImages,
} from "@/lib/reports/pdf/report-pdf";
import { PDF_BATCH_SIZE } from "@/lib/reports/pdf-progress";
import { flatText, readPdf } from "./pdf-text";
import {
  MAX_CLASS_COMMENT,
  MAX_HEAD_COMMENT,
  MAX_SUBJECT_COMMENT,
  SUBJECT_NAMES,
  publishedSnapshot,
  subjectLine,
} from "./report-fixture";

// The report PDF's layout rules (US-6.4, REPORT_LAYOUT.md sections 2 to 4;
// D45), checked on the PDF file itself: drawn from a snapshot, then read
// back page by page.

const PORTAL = "https://portal.example";
const image = {
  data: readFileSync(path.join(process.cwd(), "tests/e2e/fixtures/logo.png")),
  format: "png" as const,
};
/** A different PNG per name, since the PDF stores identical images once. */
const png = async (name: string) => ({
  data: await QRCode.toBuffer(name, { type: "png" }),
  format: "png" as const,
});

function doc(
  overrides: Record<string, unknown> = {},
  sections: Record<string, boolean> = {},
): ReportDocument {
  const d = readReportDocument(publishedSnapshot(overrides, sections));
  if (!d) throw new Error("fixture is not a published snapshot");
  return d;
}

async function pages(d: ReportDocument, images: ReportImages = NO_IMAGES) {
  return readPdf(await renderReportPdf(d, images, PORTAL));
}

const fullClass = {
  subjects: SUBJECT_NAMES.map((n, i) => subjectLine(n, i, { comment: MAX_SUBJECT_COMMENT })),
  class_comment: MAX_CLASS_COMMENT,
  head_comment: MAX_HEAD_COMMENT,
};

describe("the report PDF", () => {
  it("says everything the snapshot holds, in the snapshot's subject order", async () => {
    const d = doc({
      subjects: [
        subjectLine("English Language", 0, { comment: "Reads widely." }),
        subjectLine("Mathematics", 1, { comment: "Strong in algebra." }),
        subjectLine("History", 2, {
          mark: null,
          grade: null,
          status: "incomplete",
          not_available: true,
          comment: null,
        }),
      ],
    });
    const result = await pages(d);
    expect(result).toHaveLength(1);
    const text = flatText(result);
    for (const expected of [
      "Msasa Demo High School",
      "Excellence in all things",
      "12 Msasa Road, Harare",
      "Term report",
      "Term 1 2026",
      "Tendai Ncube",
      "MS2026-014",
      "4 Blue",
      "Subject Mark Grade Teacher's comment Teacher",
      "English Language 40 E Reads widely. Teacher 1 Signed 2 April 2026",
      "Mathematics 47 D Strong in algebra.",
      "History – – Result not available.",
      "Average 64.3%",
      "Position 12 of 30",
      "Class teacher's comment A good term overall.",
      "Head's comment Well done.",
      "Grading key (O-Level) A 70–100 B 60–69 C 50–59 D 45–49 E 40–44 U 0–39",
      "This report is issued without erasure or amendments.",
      "Reference ABCD2345EF",
      `Check this report: ${PORTAL}/verify/QRSTUVWXYZ23456789ABCDEF`,
      PLATFORM_FOOTER,
      "Page 1 of 1",
    ])
      expect(text).toContain(expected);
    expect(text.indexOf("English Language")).toBeLessThan(text.indexOf("Mathematics"));
    expect(text.indexOf("Mathematics")).toBeLessThan(text.indexOf("History"));
    expect(text).not.toContain("Amended");
  });

  it("draws all text in black or dark grey, so it prints in black and white", async () => {
    const [page] = await pages(doc());
    expect(page!.textColors.sort()).toEqual(["0.00 0.00 0.00", "0.20 0.20 0.20"]);
  });

  it("is the same file every time for the same snapshot", async () => {
    const d = doc(fullClass);
    const a = await renderReportPdf(d, { ...NO_IMAGES, logo: image }, PORTAL);
    const b = await renderReportPdf(
      readReportDocument(publishedSnapshot(fullClass))!,
      { ...NO_IMAGES, logo: image },
      PORTAL,
    );
    expect(a.equals(b)).toBe(true);
    expect(a.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("encodes the verification address in the QR code", () => {
    const url = `${PORTAL}/verify/QRSTUVWXYZ23456789ABCDEF`;
    const qr = qrMatrix(url);
    const expected = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    expect(qr.size).toBe(expected.size);
    for (let r = 0; r < qr.size; r++)
      for (let c = 0; c < qr.size; c++) expect(qr.dark(r, c)).toBe(expected.get(r, c) === 1);
  });
});

describe("page breaks", () => {
  it("12 subjects with the longest comments go onto a second page with the header repeated", async () => {
    const result = await pages(doc(fullClass), { ...NO_IMAGES, logo: image });
    expect(result).toHaveLength(2);
    result.forEach((page, i) => {
      const text = page.text.replace(/\s+/g, " ");
      // The school header and learner block on every page, and the footer.
      expect(text).toContain("Msasa Demo High School");
      expect(text).toContain("Term report");
      expect(text).toContain("Name Tendai Ncube");
      expect(text).toContain("Learner no MS2026-014");
      expect(text).toContain(PLATFORM_FOOTER);
      expect(text).toContain(`Page ${i + 1} of 2`);
      expect(page.images).toBe(1); // the logo, repeated
    });
    // Every subject exactly once, each row whole on one page (comment and teacher with it).
    const all = flatText(result);
    SUBJECT_NAMES.forEach((name, i) => {
      const rows = result.flatMap((p) => p.lines).filter((l) => l.trim() === name);
      expect(rows, name).toHaveLength(1);
      const page = result.find((p) => p.text.includes(name))!;
      expect(page.text.replace(/\s+/g, " ")).toContain(`Teacher ${i + 1} Signed`);
    });
    // Long comments wrap inside their cells and are printed in full.
    expect(result[0]!.lines.filter((l) => l.startsWith("Works steadily")).length).toBeGreaterThan(
      0,
    );
    expect(all.split(MAX_SUBJECT_COMMENT.replace(/\s+/g, " ")).length - 1).toBe(12);
    expect(all).toContain(MAX_CLASS_COMMENT);
    expect(all).toContain(MAX_HEAD_COMMENT);
    // The closing parts follow the table, the verification block last.
    expect(all.indexOf("Computer Studies")).toBeLessThan(all.indexOf("Grading key"));
    expect(all.indexOf("Grading key")).toBeLessThan(all.indexOf("Reference ABCD2345EF"));
  });

  it("a table that runs onto a second page repeats its column headings there", async () => {
    const subjects = Array.from({ length: 30 }, (_, i) =>
      subjectLine(`Subject ${i + 1}`, i, { comment: MAX_SUBJECT_COMMENT }),
    );
    const result = await pages(doc({ subjects }));
    expect(result.length).toBeGreaterThanOrEqual(2);
    const texts = result.map((p) => p.text.replace(/\s+/g, " "));
    const headings = "Subject Mark Grade Teacher's comment Teacher";
    expect(texts[1]).toMatch(/Subject \d+/);
    for (const text of texts.filter((t) => /Subject \d+/.test(t))) expect(text).toContain(headings);
  });

  it("a short report stays on one page", async () => {
    expect(await pages(doc())).toHaveLength(1);
  });

  it("a batch of the longest reports draws well inside a hosted request's time limit", async () => {
    const d = doc(fullClass);
    await renderReportPdf(d, NO_IMAGES, PORTAL); // fonts loaded once per server
    const started = performance.now();
    for (let i = 0; i < PDF_BATCH_SIZE; i++) await renderReportPdf(d, NO_IMAGES, PORTAL);
    // About 130 ms each here; a 10 s limit leaves room for storage and a slow machine.
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

describe("sections switched off", () => {
  it("leaves out each part the template switches off", async () => {
    const text = flatText(
      await pages(
        doc(
          { head_comment: "Well done." },
          {
            subject_comments: false,
            teacher_signature: false,
            average_position: false,
            class_comment: false,
            head_comment: false,
            grading_key: false,
            legal_line: false,
            verification: false,
          },
        ),
      ),
    );
    for (const absent of [
      "Teacher's comment",
      "Good progress this term.",
      "Teacher 1",
      "Signed",
      "Average",
      "Position",
      "Class teacher's comment",
      "Head's comment",
      "Well done.",
      "Grading key",
      "issued without erasure",
      "Reference",
      "Ref ",
      "/verify/",
    ])
      expect(text, absent).not.toContain(absent);
    // Always printed.
    for (const present of [
      "Msasa Demo High School",
      "Tendai Ncube",
      "Mathematics",
      PLATFORM_FOOTER,
    ])
      expect(text).toContain(present);
    expect(text).toContain("Subject Mark Grade");
  });

  it("keeps the comments but not the signed date when only the signature is off", async () => {
    const text = flatText(await pages(doc({}, { teacher_signature: false })));
    expect(text).toContain("Good progress this term. Teacher 1");
    expect(text).not.toContain("Signed");
  });

  it("uses the template's comment heading and legal line", async () => {
    const text = flatText(
      await pages(
        doc({
          template: {
            ...(publishedSnapshot().template as object),
            comment_label: "Tutor's comment",
            footer_text: "Issued by the school office.",
          },
        }),
      ),
    );
    expect(text).toContain("Tutor's comment");
    expect(text).toContain("Issued by the school office.");
    expect(text).not.toContain("Teacher's comment");
  });
});

describe("images", () => {
  it("no logo, no stamp and no signature: no images, and the header still prints", async () => {
    const [page] = await pages(doc());
    expect(page!.images).toBe(0);
    expect(page!.text).toContain("Msasa Demo High School");
  });

  it("the signature without a stamp prints only the signature, with the head's name", async () => {
    const [page] = await pages(doc(), { ...NO_IMAGES, headSignature: image });
    expect(page!.images).toBe(1);
    expect(flatText([page!])).toContain("Head: Mrs P. Dube");
  });

  it("logo, stamp and signature together", async () => {
    const [page] = await pages(doc(), {
      logo: image,
      stamp: await png("stamp"),
      headSignature: await png("signature"),
    });
    expect(page!.images).toBe(3);
  });

  it("a stamp or signature switched off is not printed even when the school has one", async () => {
    const d = doc(
      {
        school: {
          ...(publishedSnapshot().school as object),
          stamp_path: "s/stamp-1.png",
          head_signature_path: "s/head-signature-1.png",
        },
      },
      { school_stamp: false, head_signature: false },
    );
    expect(d.school.stampPath).toBeNull();
    expect(d.school.headSignaturePath).toBeNull();
    const [page] = await pages(d, {
      logo: null,
      stamp: await png("stamp"),
      headSignature: await png("signature"),
    });
    expect(page!.images).toBe(0);
  });
});

describe("report kinds", () => {
  it("a vacation report has no position or class comment and is 'checked by' the head", async () => {
    const d = doc(
      { kind: "vacation", average: null, position: null, class_size: null, class_comment: null },
      { average_position: false, class_comment: false, head_comment: false },
    );
    const text = flatText(await pages(d, { ...NO_IMAGES, headSignature: image }));
    expect(text).toContain("Checked by: Mrs P. Dube");
    expect(text).not.toContain("Position");
    expect(text).not.toContain("Class teacher's comment");
  });

  it("a reissued version says Amended with its version number", async () => {
    expect(flatText(await pages(doc({ version: 2 })))).toContain("Amended · version 2");
  });
});

describe("long text in the layout", () => {
  const LONG_NAME = "Tanatswanashe Rutendo Nyasha Chiedza Makanaka Mutasa-Chikwanha";

  it("cuts a long name short in the page line, so it stays clear of the footer", async () => {
    expect(pageLineName("Tendai Ncube")).toBe("Tendai Ncube");
    expect(pageLineName(LONG_NAME)).toHaveLength(40);
    expect(pageLineName(LONG_NAME).endsWith("…")).toBe(true);
    const result = await pages(doc({ learner: { name: LONG_NAME, learner_number: "MS2026-099" } }));
    const text = result[0]!.text.replace(/\s+/g, " ");
    // The learner block prints the whole name; the page line the short one.
    expect(text).toContain(`Name ${LONG_NAME}`);
    expect(text).toContain(`${pageLineName(LONG_NAME)} · Ref ABCD2345EF · Page 1 of 1`);
    expect(text).toContain(PLATFORM_FOOTER);
  });

  it("gives grades longer than 3 characters a wider column, taken from the comments", () => {
    const sum = (w: Record<string, string>) =>
      Object.values(w).reduce((t, v) => t + Number.parseFloat(v), 0);
    const narrow = subjectColumns(true);
    const wide = subjectColumns(true, 10);
    expect(narrow.grade).toBe("7%");
    expect(Number.parseFloat(wide.grade)).toBeGreaterThanOrEqual(13);
    expect(sum(narrow)).toBe(100);
    expect(sum(wide)).toBe(100);
    expect(sum(subjectColumns(false, 10))).toBe(100);
  });

  it("measures the longest grade from the subjects and the key", () => {
    expect(longestGrade(doc())).toBe(1);
    const words = doc({
      grading_key: {
        scale: "Primary words",
        level: "Grade 7",
        bands: [
          { grade: "Excellent", min_mark: 80, max_mark: 100, remark: null },
          { grade: "Good", min_mark: 0, max_mark: 79, remark: null },
        ],
      },
      subjects: [subjectLine("Mathematics", 0, { grade: "Good" })],
    });
    expect(longestGrade(words)).toBe(9);
  });

  it("prints a 10-character grade whole", async () => {
    const d = doc({ subjects: [subjectLine("Mathematics", 0, { grade: "Proficient" })] });
    const lines = (await pages(d)).flatMap((p) => p.lines.map((l) => l.trim()));
    expect(lines).toContain("Proficient");
  });
});
