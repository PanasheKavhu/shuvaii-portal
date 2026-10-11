import { describe, expect, it } from "vitest";
import {
  REPORT_SECTIONS,
  defaultSections,
  parseTemplate,
  readSections,
  reportAssetPath,
  reportAssetUploadedAt,
  reportPdfPath,
  sectionLockReason,
} from "@/lib/reports/templates";

const SCHOOL = "9341cf1e-f77b-5e4a-abbe-6a72f8c4a2fa";
const allOn = Object.fromEntries(REPORT_SECTIONS.map(({ key }) => [key, "on"]));

describe("report template defaults (REPORT_LAYOUT section 2)", () => {
  it("turns on positions, class and head's comments for term reports only", () => {
    expect(defaultSections("term")).toMatchObject({
      average_position: true,
      class_comment: true,
      head_comment: true,
      attendance: false,
    });
    expect(defaultSections("vacation")).toMatchObject({
      average_position: false,
      class_comment: false,
      head_comment: false,
      head_signature: true,
      school_stamp: true,
    });
    expect(defaultSections("mock")).toEqual(defaultSections("term"));
  });

  it("reads stored sections, filling gaps with the defaults", () => {
    expect(readSections({ grading_key: false, unknown: true }, "term")).toEqual({
      ...defaultSections("term"),
      grading_key: false,
    });
    expect(readSections(null, "vacation")).toEqual(defaultSections("vacation"));
  });
});

describe("parseTemplate", () => {
  it("reads checkboxes, keeping locked switches off", () => {
    const parsed = parseTemplate(
      { sections: allOn, footerText: "  Issued by the school. ", commentLabel: "Tutor's comment" },
      "vacation",
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        sections: {
          ...Object.fromEntries(REPORT_SECTIONS.map(({ key }) => [key, true])),
          average_position: false,
          class_comment: false,
          attendance: false,
        },
        footerText: "Issued by the school.",
        commentLabel: "Tutor's comment",
      },
    });
    expect(sectionLockReason("class_comment", "term")).toBeNull();
    expect(sectionLockReason("class_comment", "vacation")).toMatch(/no class teacher's comment/);
  });

  it("needs a comment heading and footer text within their limits", () => {
    expect(parseTemplate({ sections: allOn, footerText: "", commentLabel: " " }, "term")).toEqual({
      ok: false,
      errors: {
        commentLabel: "Enter a heading for the comment column.",
        footerText: "Enter the footer text, or switch the legal line off.",
      },
    });
    const long = parseTemplate(
      { sections: {}, footerText: "x".repeat(201), commentLabel: "y".repeat(31) },
      "term",
    );
    expect(long.ok).toBe(false);
    expect(
      parseTemplate({ sections: {}, footerText: "", commentLabel: "Comment" }, "term").ok,
    ).toBe(true);
  });
});

describe("report file paths", () => {
  it("names stamp and signature uploads uniquely and reads their date back", () => {
    const now = new Date("2026-10-11T09:00:00Z");
    const path = reportAssetPath(SCHOOL, "head-signature", "png", now);
    expect(path).toBe(`${SCHOOL}/head-signature-${now.getTime()}.png`);
    expect(reportAssetUploadedAt(path)).toEqual(now);
    expect(reportAssetUploadedAt(null)).toBeNull();
  });

  it("puts each PDF version at school/report/vN.pdf", () => {
    expect(reportPdfPath(SCHOOL, "r1", 2)).toBe(`${SCHOOL}/r1/v2.pdf`);
  });
});
