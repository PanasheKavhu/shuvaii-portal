import { formulaSafe } from "@/lib/people/csv";
import type { XlsxSheet, XlsxWriteCell } from "@/lib/people/xlsx-write";

/**
 * The three Excel exports (SPEC US-9.4; D52) as sheets. Pure: the caller
 * passes the jsonb document public.export_learners(),
 * export_class_marks() or export_class_comments() returned, and gets the
 * rows to write.
 *
 * Every text cell goes through formulaSafe() (D37): a name or comment
 * starting with =, +, -, @, tab or carriage return gets a leading
 * apostrophe, so it stays text in Excel and in any CSV saved from it.
 * Marks stay numbers.
 */

export type ExportKind = "learners" | "marks" | "comments";

export const EXPORT_KINDS: readonly ExportKind[] = ["learners", "marks", "comments"];

export function isExportKind(value: unknown): value is ExportKind {
  return typeof value === "string" && (EXPORT_KINDS as readonly string[]).includes(value);
}

export type GuardianDoc = {
  full_name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
};

export type LearnersDoc = {
  rows: {
    learner_number: string;
    last_name: string;
    first_name: string;
    date_of_birth: string | null;
    sex: string | null;
    status: string;
    admission_date: string | null;
    class_name: string | null;
    year_label: string | null;
    guardians: GuardianDoc[];
  }[];
};

type ClassDoc = { class_name: string; term_name: string; year_label: string };

export type MarksDoc = ClassDoc & {
  columns: { id: string; subject: string; assessment: string; max_mark: number }[];
  rows: {
    learner_number: string;
    last_name: string;
    first_name: string;
    status: string;
    /** By assessment id: the score, or "A" (absent) or "E" (excused). */
    marks: Record<string, number | string>;
  }[];
};

export type CommentsDoc = ClassDoc & {
  columns: { id: string; subject: string }[];
  rows: {
    learner_number: string;
    last_name: string;
    first_name: string;
    status: string;
    /** By class subject id. */
    subjects: Record<string, string>;
    class_comment: string | null;
  }[];
};

const text = (v: string | null | undefined): XlsxWriteCell =>
  v == null || v === "" ? null : formulaSafe(v);

/** "enrolled" → "Enrolled", "left" → "Left". */
export function statusLabel(status: string): string {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const width = (header: string, min = 12, max = 40) =>
  Math.min(max, Math.max(min, header.length + 2));

/** Learners and guardians: one row per learner, a block of columns per guardian. */
export function learnersSheet(doc: LearnersDoc): XlsxSheet {
  const guardianSets = Math.max(1, ...doc.rows.map((r) => r.guardians.length));
  const header = [
    "Learner number",
    "Surname",
    "First name",
    "Date of birth",
    "Sex",
    "Status",
    "Admission date",
    "Class",
    "Year",
  ];
  for (let n = 1; n <= guardianSets; n++) {
    header.push(
      `Guardian ${n} name`,
      `Guardian ${n} relationship`,
      `Guardian ${n} phone`,
      `Guardian ${n} email`,
      `Guardian ${n} primary`,
    );
  }
  const rows: XlsxWriteCell[][] = doc.rows.map((r) => {
    const cells: XlsxWriteCell[] = [
      text(r.learner_number),
      text(r.last_name),
      text(r.first_name),
      text(r.date_of_birth),
      text(r.sex),
      statusLabel(r.status),
      text(r.admission_date),
      text(r.class_name),
      text(r.year_label),
    ];
    for (let n = 0; n < guardianSets; n++) {
      const g = r.guardians[n];
      cells.push(
        text(g?.full_name),
        text(g?.relationship),
        text(g?.phone),
        text(g?.email),
        g ? (g.is_primary ? "Yes" : "No") : null,
      );
    }
    return cells;
  });
  return {
    name: "Learners and guardians",
    rows: [header, ...rows],
    widths: header.map((h, i) => (i === 1 || i === 2 || h.endsWith("name") ? 24 : width(h))),
  };
}

const LEARNER_HEADER = ["Learner number", "Surname", "First name", "Enrolment"];
const LEARNER_WIDTHS = [16, 20, 20, 12];

function learnerCells(r: {
  learner_number: string;
  last_name: string;
  first_name: string;
  status: string;
}): XlsxWriteCell[] {
  return [text(r.learner_number), text(r.last_name), text(r.first_name), statusLabel(r.status)];
}

/** "English: Test 1 (out of 30)". */
export function assessmentHeading(c: MarksDoc["columns"][number]): string {
  return `${c.subject}: ${c.assessment} (out of ${c.max_mark})`;
}

/** A class's marks for a term: one row per learner, one column per subject and assessment. */
export function marksSheet(doc: MarksDoc): XlsxSheet {
  const header = [...LEARNER_HEADER, ...doc.columns.map(assessmentHeading)];
  const rows = doc.rows.map((r) => [
    ...learnerCells(r),
    ...doc.columns.map((c): XlsxWriteCell => {
      const v = r.marks[c.id];
      return typeof v === "number" ? v : v == null ? null : text(String(v));
    }),
  ]);
  return {
    name: `${doc.class_name} ${doc.term_name} marks`,
    rows: [header, ...rows],
    widths: [...LEARNER_WIDTHS, ...header.slice(LEARNER_HEADER.length).map((h) => width(h))],
  };
}

/** A class's comments for a term: one column per subject, then the class teacher's. */
export function commentsSheet(doc: CommentsDoc): XlsxSheet {
  const header = [
    ...LEARNER_HEADER,
    ...doc.columns.map((c) => `${c.subject} comment`),
    "Class teacher's comment",
  ];
  const rows = doc.rows.map((r) => [
    ...learnerCells(r),
    ...doc.columns.map((c) => text(r.subjects[c.id])),
    text(r.class_comment),
  ]);
  return {
    name: `${doc.class_name} ${doc.term_name} comments`,
    rows: [header, ...rows],
    widths: [...LEARNER_WIDTHS, ...doc.columns.map(() => 40), 60],
  };
}

/** "marks-4-blue-term-1-2026.xlsx": safe for any file system and header. */
export function exportFileName(parts: readonly (string | null | undefined)[]): string {
  const base = parts
    .filter(Boolean)
    .join(" ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${base || "export"}.xlsx`;
}
