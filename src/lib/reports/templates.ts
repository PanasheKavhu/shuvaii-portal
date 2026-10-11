import type { TermKind } from "@/lib/setup/calendar";

/**
 * Report templates (REPORT_LAYOUT.md section 2, Q28; D43): the parts of a
 * report a school may switch off, per term kind. Mirrors
 * private.report_section_keys(), private.default_report_sections() and
 * private.report_sections_are_valid() in the reports migration.
 *
 * The school header, title and period, learner block, subject table
 * (subject, mark, grade) and the platform footer are always printed.
 */

export const REPORT_SECTIONS = [
  {
    key: "subject_comments",
    label: "Subject teacher's comment and name",
  },
  { key: "teacher_signature", label: "Teacher's signed date (digital signature)" },
  { key: "average_position", label: "Class average and position" },
  { key: "attendance", label: "Attendance summary" },
  { key: "class_comment", label: "Class teacher's comment" },
  { key: "head_comment", label: "Head's comment" },
  { key: "head_signature", label: "Head's signature image" },
  { key: "school_stamp", label: "School stamp" },
  { key: "grading_key", label: "Grading key" },
  { key: "legal_line", label: "Legal line (footer text)" },
  { key: "verification", label: "QR code and reference for checking the report" },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];
export type ReportSections = Record<ReportSectionKey, boolean>;

export const ALWAYS_SHOWN = [
  "School name, logo, motto and contacts",
  "Report title and term",
  "Learner's name, number, class and year",
  "Subjects with mark and grade",
  "Implemented by Panashe and Shuvai 2026",
] as const;

/** Why a section cannot be switched on, or null when it can. */
export function sectionLockReason(key: ReportSectionKey, kind: TermKind): string | null {
  if (kind === "vacation" && key === "average_position") {
    return "Vacation school has no class average or position.";
  }
  if (kind === "vacation" && key === "class_comment") {
    return "Vacation school has no class teacher's comment.";
  }
  if (key === "attendance") return "Attendance is not recorded in the portal yet.";
  return null;
}

export function defaultSections(kind: TermKind): ReportSections {
  const term = kind !== "vacation";
  return {
    subject_comments: true,
    teacher_signature: true,
    average_position: term,
    attendance: false,
    class_comment: term,
    head_comment: term,
    head_signature: true,
    school_stamp: true,
    grading_key: true,
    legal_line: true,
    verification: true,
  };
}

/** A stored `sections` value as a full set of switches (unknown keys dropped). */
export function readSections(value: unknown, kind: TermKind): ReportSections {
  const out = defaultSections(kind);
  if (value && typeof value === "object") {
    for (const { key } of REPORT_SECTIONS) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

export const FOOTER_MAX = 200;
export const COMMENT_LABEL_MAX = 30;
export const DEFAULT_COMMENT_LABEL = "Teacher's comment";

export type TemplateInput = {
  /** Checkbox values: present (any string) means on. */
  sections: Partial<Record<ReportSectionKey, unknown>>;
  footerText: unknown;
  commentLabel: unknown;
};

export type ParsedTemplate =
  | { ok: true; value: { sections: ReportSections; footerText: string; commentLabel: string } }
  | { ok: false; errors: Record<string, string> };

/** Validates the report settings form for one term kind. */
export function parseTemplate(input: TemplateInput, kind: TermKind): ParsedTemplate {
  const errors: Record<string, string> = {};
  const sections = {} as ReportSections;
  for (const { key } of REPORT_SECTIONS) {
    const v = input.sections[key];
    const on = typeof v === "string" && v !== "";
    // A locked switch keeps its only allowed value, whatever was sent.
    sections[key] = sectionLockReason(key, kind) ? false : on;
  }

  const footerText = typeof input.footerText === "string" ? input.footerText.trim() : "";
  if (footerText.length > FOOTER_MAX) {
    errors.footerText = `Keep it to ${FOOTER_MAX} characters or fewer.`;
  }
  const commentLabel = typeof input.commentLabel === "string" ? input.commentLabel.trim() : "";
  if (!commentLabel) errors.commentLabel = "Enter a heading for the comment column.";
  else if (commentLabel.length > COMMENT_LABEL_MAX) {
    errors.commentLabel = `Keep it to ${COMMENT_LABEL_MAX} characters or fewer.`;
  }
  if (sections.legal_line && !footerText) {
    errors.footerText = "Enter the footer text, or switch the legal line off.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { sections, footerText, commentLabel } };
}

/** The stamp and the head's signature (school admin uploads, D43). */
export const REPORT_ASSETS = {
  stamp: { column: "stamp_path", label: "School stamp", prefix: "stamp" },
  "head-signature": {
    column: "head_signature_path",
    label: "Head's signature",
    prefix: "head-signature",
  },
} as const;

export type ReportAsset = keyof typeof REPORT_ASSETS;

export function isReportAsset(value: unknown): value is ReportAsset {
  return typeof value === "string" && Object.hasOwn(REPORT_ASSETS, value);
}

/** Object name in the report-assets bucket; new per upload, so old images are kept. */
export function reportAssetPath(
  schoolId: string,
  asset: ReportAsset,
  extension: string,
  now: Date,
): string {
  return `${schoolId}/${REPORT_ASSETS[asset].prefix}-${now.getTime()}.${extension}`;
}

/** When an asset was uploaded, from the time in its object name. */
export function reportAssetUploadedAt(path: string | null): Date | null {
  const ms = path?.match(/-(\d{1,15})\.(png|jpg|webp)$/)?.[1];
  return ms ? new Date(Number(ms)) : null;
}

/** A published report's PDF in the reports bucket (written by the server only). */
export function reportPdfPath(schoolId: string, reportId: string, version: number): string {
  return `${schoolId}/${reportId}/v${version}.pdf`;
}
