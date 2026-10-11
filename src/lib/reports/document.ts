import { isHexColor, parseHex, toHex } from "@/lib/branding/contrast";
import { readSections, type ReportSections } from "./templates";
import type { TermKind } from "@/lib/setup/calendar";

/**
 * A published report as the PDF prints it (US-6.4, REPORT_LAYOUT.md; D45),
 * read only from the frozen snapshot that publish_class_reports() stored,
 * never from live tables. Pure: the same snapshot always gives the same
 * document.
 */

export type ReportDocumentLine = {
  subject: string;
  mark: number | null;
  grade: string | null;
  /** The head marked this subject "result not available" (REPORT_LAYOUT section 4). */
  notAvailable: boolean;
  comment: string | null;
  teacher: string | null;
  signedAt: string | null;
};

export type ReportDocument = {
  referenceCode: string;
  verificationCode: string;
  version: number;
  publishedAt: string;
  kind: TermKind;
  title: string;
  sections: ReportSections;
  commentLabel: string;
  legalLine: string | null;
  school: {
    name: string;
    motto: string | null;
    /** Address, phone and email on one line, the parts that are set. */
    contact: string | null;
    logoPath: string | null;
    stampPath: string | null;
    headSignaturePath: string | null;
    primaryColor: string;
    accentColor: string;
  };
  learner: { name: string; number: string | null };
  className: string;
  gradeLevel: string | null;
  year: string;
  termName: string;
  subjects: ReportDocumentLine[];
  average: number | null;
  position: number | null;
  classSize: number | null;
  classComment: string | null;
  headComment: string | null;
  headName: string | null;
  gradingKey: {
    scale: string | null;
    bands: { grade: string; minMark: number; maxMark: number; remark: string | null }[];
  };
};

/** Colours when a school has none set: a dark neutral that prints as solid grey. */
export const DEFAULT_PRIMARY = "#1f2937";
export const DEFAULT_ACCENT = "#6b7280";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isKind = (v: unknown): v is TermKind => v === "term" || v === "vacation" || v === "mock";

/**
 * The frozen snapshot of a published report as a document, or null when it
 * is not a published snapshot (no codes or publication time yet).
 */
export function readReportDocument(snapshot: unknown): ReportDocument | null {
  const s = obj(snapshot);
  const referenceCode = str(s.reference_code);
  const verificationCode = str(s.verification_code);
  const publishedAt = str(s.published_at);
  if (!referenceCode || !verificationCode || !publishedAt) return null;

  const term = obj(s.term);
  const kind: TermKind = isKind(s.kind) ? s.kind : isKind(term.kind) ? term.kind : "term";
  const template = obj(s.template);
  const sections = readSections(template.sections, kind);
  const school = obj(s.school);
  const learner = obj(s.learner);
  const key = obj(s.grading_key);
  const lines = Array.isArray(s.subjects) ? s.subjects : [];
  const bands = Array.isArray(key.bands) ? key.bands : [];
  const contact = [str(school.address), str(school.phone), str(school.email)].filter(Boolean);
  const primary = str(school.primary_color);
  const accent = str(school.accent_color);

  return {
    referenceCode,
    verificationCode,
    version: num(s.version) ?? 1,
    publishedAt,
    kind,
    title: str(template.name) ?? "School report",
    sections,
    commentLabel: str(template.comment_label) ?? "Teacher's comment",
    legalLine: sections.legal_line ? str(template.footer_text) : null,
    school: {
      name: str(school.name) ?? "School",
      motto: str(school.motto),
      contact: contact.length ? contact.join(" · ") : null,
      logoPath: str(school.logo_path),
      stampPath: sections.school_stamp ? str(school.stamp_path) : null,
      headSignaturePath: sections.head_signature ? str(school.head_signature_path) : null,
      primaryColor: isHexColor(primary) ? primary : DEFAULT_PRIMARY,
      accentColor: isHexColor(accent) ? accent : isHexColor(primary) ? primary : DEFAULT_ACCENT,
    },
    learner: { name: str(learner.name) ?? "", number: str(learner.learner_number) },
    className: str(s.class) ?? "",
    gradeLevel: str(s.grade_level),
    year: str(s.year) ?? "",
    termName: str(term.name) ?? "",
    // Already in subject order (sort_order, then name) from the snapshot.
    subjects: lines.map((raw) => {
      const l = obj(raw);
      const notAvailable = l.not_available === true;
      return {
        subject: str(l.subject) ?? "Subject",
        mark: notAvailable ? null : num(l.mark),
        grade: notAvailable ? null : str(l.grade),
        notAvailable,
        comment: sections.subject_comments ? str(l.comment) : null,
        teacher: sections.subject_comments ? str(l.teacher) : null,
        signedAt: sections.teacher_signature ? str(l.signed_at) : null,
      };
    }),
    average: sections.average_position ? num(s.average) : null,
    position: sections.average_position ? num(s.position) : null,
    classSize: sections.average_position ? num(s.class_size) : null,
    classComment: sections.class_comment ? str(s.class_comment) : null,
    headComment: sections.head_comment ? str(s.head_comment) : null,
    headName: str(s.head_name),
    gradingKey: {
      scale: str(key.scale),
      bands: bands.map((raw) => {
        const b = obj(raw);
        return {
          grade: str(b.grade) ?? "",
          minMark: num(b.min_mark) ?? 0,
          maxMark: num(b.max_mark) ?? 0,
          remark: str(b.remark),
        };
      }),
    },
  };
}

/** The address the QR code opens (REPORT_LAYOUT section 4). */
export function verifyUrl(portalUrl: string, verificationCode: string): string {
  return `${portalUrl.replace(/\/+$/, "")}/verify/${verificationCode}`;
}

/** A colour mixed with white: `amount` 0 is white, 1 the colour itself. */
export function tint(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  return toHex({ r: mix(r), g: mix(g), b: mix(b) });
}

/** "12 March 2026", in the school's own words for dates; never the time. */
export function printedDate(iso: string, timeZone = "Africa/Harare"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone }).format(date);
}

/** The line under the table: "Average 64.3%", "Position 12 of 30", either or both. */
export function resultsLine(doc: Pick<ReportDocument, "average" | "position" | "classSize">) {
  const parts: string[] = [];
  if (doc.average != null) parts.push(`Average ${doc.average.toFixed(1)}%`);
  if (doc.position != null)
    parts.push(
      doc.classSize != null
        ? `Position ${doc.position} of ${doc.classSize}`
        : `Position ${doc.position}`,
    );
  return parts.length ? parts.join("   ·   ") : null;
}

/** "A 70–100" for the grading key. */
export function bandLabel(b: { grade: string; minMark: number; maxMark: number }): string {
  return `${b.grade} ${b.minMark}–${b.maxMark}`;
}
