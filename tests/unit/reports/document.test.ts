import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  readReportDocument,
  resultsLine,
  tint,
  verifyUrl,
} from "@/lib/reports/document";
import { imageKind } from "@/lib/reports/pdf/images";
import { pdfProgressLine } from "@/lib/reports/pdf-progress";
import {
  NOT_FOUND_OR_WITHDRAWN,
  VERIFY_LIMIT,
  VERIFY_WINDOW_MS,
  normalizeVerificationCode,
  readVerification,
  verifyBlockedUntil,
} from "@/lib/reports/verify";
import { publishedSnapshot, subjectLine } from "./report-fixture";

describe("readReportDocument", () => {
  it("needs a published snapshot: codes and a publication time", () => {
    const draft = { ...publishedSnapshot(), reference_code: null };
    expect(readReportDocument(draft)).toBeNull();
    expect(readReportDocument(null)).toBeNull();
    expect(readReportDocument("nonsense")).toBeNull();
  });

  it("reads the frozen fields as printed", () => {
    const d = readReportDocument(publishedSnapshot())!;
    expect(d.referenceCode).toBe("ABCD2345EF");
    expect(d.school.contact).toBe("12 Msasa Road, Harare · +263 242 000 000 · office@msasa.demo");
    expect(d.school.primaryColor).toBe("#0b5fa5");
    expect(d.subjects.map((s) => s.subject)).toEqual([
      "English Language",
      "English Literature",
      "Mathematics",
    ]);
    expect(d.gradingKey.bands[0]).toEqual({ grade: "A", minMark: 70, maxMark: 100, remark: null });
    expect(d.legalLine).toBe("This report is issued without erasure or amendments.");
  });

  it("prints no mark or grade for a subject marked 'result not available'", () => {
    const d = readReportDocument(
      publishedSnapshot({ subjects: [subjectLine("History", 0, { not_available: true })] }),
    )!;
    expect(d.subjects[0]).toMatchObject({ mark: null, grade: null, notAvailable: true });
  });

  it("leaves out what the template switches off, whatever the snapshot holds", () => {
    const d = readReportDocument(
      publishedSnapshot(
        {},
        {
          subject_comments: false,
          teacher_signature: false,
          average_position: false,
          class_comment: false,
          head_comment: false,
          legal_line: false,
        },
      ),
    )!;
    expect(d.subjects[0]).toMatchObject({ comment: null, teacher: null, signedAt: null });
    expect([d.average, d.position, d.classSize, d.classComment, d.headComment]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(d.legalLine).toBeNull();
  });

  it("falls back to neutral colours, and to the primary for a missing accent", () => {
    const school = publishedSnapshot().school as Record<string, unknown>;
    const none = readReportDocument(
      publishedSnapshot({
        school: { ...school, primary_color: null, accent_color: "not a colour" },
      }),
    )!;
    expect([none.school.primaryColor, none.school.accentColor]).toEqual([
      DEFAULT_PRIMARY,
      DEFAULT_ACCENT,
    ]);
    const noAccent = readReportDocument(
      publishedSnapshot({ school: { ...school, accent_color: null } }),
    )!;
    expect(noAccent.school.accentColor).toBe("#0b5fa5");
  });
});

describe("printing helpers", () => {
  it("builds the verification address without doubled slashes", () => {
    expect(verifyUrl("https://sp.example/", "ABC")).toBe("https://sp.example/verify/ABC");
  });

  it("tints towards white", () => {
    expect(tint("#000000", 0)).toBe("#ffffff");
    expect(tint("#000000", 1)).toBe("#000000");
    expect(tint("#ff0000", 0.5)).toBe("#ff8080");
  });

  it("writes the results line from what is shown", () => {
    expect(resultsLine({ average: 64.25, position: 3, classSize: 30 })).toBe(
      "Average 64.3%   ·   Position 3 of 30",
    );
    expect(resultsLine({ average: null, position: null, classSize: null })).toBeNull();
  });

  it("knows PNG, JPEG and WebP by their first bytes", () => {
    const b = (...bytes: number[]) => Uint8Array.from(bytes);
    expect(imageKind(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(imageKind(b(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(
      imageKind(b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50)),
    ).toBe("webp");
    expect(imageKind(b(0x3c, 0x73, 0x76, 0x67))).toBeNull();
  });

  it("describes PDF progress", () => {
    expect(pdfProgressLine({ ready: 45, total: 45, failed: 0, working: false })).toBe(
      "45 of 45 report PDFs ready.",
    );
    expect(pdfProgressLine({ ready: 12, total: 45, failed: 0, working: true })).toBe(
      "Making PDFs: 12 of 45 report PDFs ready. Keep this page open.",
    );
    expect(pdfProgressLine({ ready: 43, total: 45, failed: 2, working: false })).toBe(
      "43 of 45 report PDFs ready. 2 could not be made. Try again to make them.",
    );
    expect(pdfProgressLine({ ready: 0, total: 1, failed: 1, working: false })).toBe(
      "0 of 1 report PDF ready. 1 could not be made. Try again to make it.",
    );
  });
});

describe("verification", () => {
  it("tidies a typed or scanned code and refuses anything else", () => {
    expect(normalizeVerificationCode("qrst-uvwx yz23-4567-89ab-cdef")).toBe(
      "QRSTUVWXYZ23456789ABCDEF",
    );
    expect(normalizeVerificationCode("QRSTUVWXYZ23456789ABCDE")).toBeNull(); // 23
    expect(normalizeVerificationCode("QRSTUVWXYZ23456789ABCDE0")).toBeNull(); // 0 is never used
    expect(normalizeVerificationCode("%E0%A4%A")).toBeNull();
    expect(normalizeVerificationCode("' or 1=1 --")).toBeNull();
  });

  it(`allows ${VERIFY_LIMIT} lookups in 10 minutes per address, then waits for the oldest`, () => {
    const now = new Date("2026-04-05T10:00:00Z");
    const at = (msAgo: number) => new Date(now.getTime() - msAgo);
    const under = Array.from({ length: VERIFY_LIMIT - 1 }, (_, i) => at(i * 1000));
    expect(verifyBlockedUntil(under, now)).toBeNull();
    const full = [...under, at(5 * 60_000)];
    expect(verifyBlockedUntil(full, now)).toEqual(
      new Date(at(5 * 60_000).getTime() + VERIFY_WINDOW_MS),
    );
    // Older than the window: forgotten.
    const old = [...under, at(VERIFY_WINDOW_MS + 1)];
    expect(verifyBlockedUntil(old, now)).toBeNull();
  });

  it("shows only the five facts, and nothing for a withdrawn or unpublished report", () => {
    const row = {
      status: "published",
      reference_code: "ABCD2345EF",
      learner_name: "Tendai Ncube",
      school_name: "Msasa Demo High School",
      term_name: "Term 1 2026",
      version: 1,
    };
    expect(readVerification(row)).toEqual({
      reference: "ABCD2345EF",
      learnerName: "Tendai Ncube",
      schoolName: "Msasa Demo High School",
      termName: "Term 1 2026",
      status: "Valid: published by the school",
    });
    expect(readVerification({ ...row, version: 2 })?.status).toContain("amended, version 2");
    expect(readVerification({ ...row, status: "withdrawn" })).toBeNull();
    expect(readVerification({ ...row, status: "approved" })).toBeNull();
    expect(readVerification(null)).toBeNull();
    expect(NOT_FOUND_OR_WITHDRAWN).toBe("Report not found or withdrawn");
  });
});
