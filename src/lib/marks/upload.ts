import { headerKey, MAX_IMPORT_ROWS, type RowError } from "@/lib/people/sheet";
import { text, type CellValue } from "@/lib/people/fields";
import { cellText, parseCell } from "./cell";

/**
 * The marks upload template and the check of an uploaded file (SPEC
 * US-4.3; D33). Pure: the caller passes the class subject's assessments,
 * its class's learners and the marks already saved.
 *
 * The template has one row per learner who takes the subject (learner
 * number and name) and one column per assessment, headed "Name (out of
 * max)", filled with the marks already saved. A cell holds a score, A for
 * absent or E for excused, as in the grid; a blank cell leaves the mark as
 * it is (marks are never deleted). Any problem means nothing is saved.
 */

export type UploadAssessment = {
  id: string;
  name: string;
  maxMark: string;
  /** False when the assessment's own lock stops this person changing it. */
  writable: boolean;
};

export type UploadLearner = {
  enrolmentId: string;
  learnerNumber: string;
  name: string;
  /** Takes this class subject (enrolment_subjects). */
  takesSubject: boolean;
  /** False once transferred, left or graduated: marks are read-only. */
  stillInClass: boolean;
};

export type ExistingMark = { status: "present" | "absent" | "excused"; score: number | null };

export type UploadContext = {
  subjectName: string;
  className: string;
  assessments: readonly UploadAssessment[];
  /** Every learner enrolled in the class this year. */
  learners: readonly UploadLearner[];
  /** Keyed `${assessmentId}:${enrolmentId}`. */
  existing: Readonly<Record<string, ExistingMark>>;
};

export type MarkWrite = {
  assessmentId: string;
  enrolmentId: string;
  status: "present" | "absent" | "excused";
  /** A decimal string, null when absent or excused. */
  score: string | null;
};

export type MarksUploadSummary = {
  learners: number;
  newMarks: number;
  changedMarks: number;
  unchanged: number;
};

export type MarksUploadPlan = {
  errors: RowError[];
  marks: MarkWrite[];
  summary: MarksUploadSummary;
};

const NUMBER_KEYS = ["learner_number", "learner_no", "student_number", "number"];
const NAME_KEYS = ["learner_name", "name", "learner", "full_name", "student_name"];

/** "Test 1 (out of 30)": the template's heading for an assessment. */
export function assessmentHeading(a: { name: string; maxMark: string }): string {
  return `${a.name} (out of ${a.maxMark})`;
}

/** The comparable key of a heading: the "(out of 30)" part is dropped. */
function headingKey(value: unknown): string {
  return headerKey(text(value).replace(/\s*\([^)]*\)\s*$/, ""));
}

const numberKey = (value: string) => value.trim().toLowerCase();

/** A cell as the text a teacher would have typed in the grid. */
export function cellInput(value: CellValue): string {
  if (typeof value === "number") {
    // Excel stores 12.3 as 12.300000000000001 after some sums.
    return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return text(value);
}

/** The template's rows: a header, then the learners who take the subject. */
export function marksTemplateRows(
  context: Pick<UploadContext, "assessments" | "learners" | "existing">,
): string[][] {
  const header = ["learner_number", "learner_name", ...context.assessments.map(assessmentHeading)];
  const rows = context.learners
    .filter((l) => l.takesSubject && l.stillInClass)
    .map((l) => [
      l.learnerNumber,
      l.name,
      ...context.assessments.map((a) => cellText(context.existing[`${a.id}:${l.enrolmentId}`])),
    ]);
  return [header, ...rows];
}

function isBlank(cells: readonly CellValue[]): boolean {
  return cells.every((c) => cellInput(c) === "");
}

function sameMark(a: ExistingMark | undefined, b: MarkWrite): boolean {
  if (!a || a.status !== b.status) return false;
  return b.score === null ? a.score === null : a.score !== null && a.score === Number(b.score);
}

export function planMarksUpload(
  rows: readonly (readonly CellValue[])[],
  context: UploadContext,
): MarksUploadPlan {
  const summary: MarksUploadSummary = { learners: 0, newMarks: 0, changedMarks: 0, unchanged: 0 };
  const fail = (errors: RowError[]): MarksUploadPlan => ({ errors, marks: [], summary });

  const headerIndex = rows.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) return fail([{ row: 0, message: "The file is empty." }]);
  const headerRow = headerIndex + 1;
  const header = rows[headerIndex]!;

  // Columns: the learner number, an optional name, and assessments by name.
  const errors: RowError[] = [];
  let numberAt = -1;
  const byKey = new Map(context.assessments.map((a) => [headerKey(a.name), a]));
  const columns: { at: number; assessment: UploadAssessment }[] = [];
  header.forEach((cell, at) => {
    const label = text(cell);
    if (!label) return;
    const key = headerKey(label);
    if (numberAt < 0 && NUMBER_KEYS.includes(key)) {
      numberAt = at;
      return;
    }
    if (NAME_KEYS.includes(key)) return;
    const assessment = byKey.get(key) ?? byKey.get(headingKey(label));
    if (!assessment) {
      errors.push({
        row: headerRow,
        message: `Column "${label}" is not an assessment of ${context.subjectName} this term. Download the template again.`,
      });
    } else if (columns.some((c) => c.assessment.id === assessment.id)) {
      errors.push({ row: headerRow, message: `${assessment.name} has two columns. Keep one.` });
    } else {
      columns.push({ at, assessment });
    }
  });
  if (numberAt < 0) {
    errors.push({
      row: headerRow,
      message: 'Missing column "learner_number". Use the template\'s header row.',
    });
  }
  if (numberAt >= 0 && columns.length === 0 && errors.length === 0) {
    errors.push({
      row: headerRow,
      message: `No assessment columns. Download the template for ${context.subjectName} again.`,
    });
  }
  if (errors.length) return fail(errors);

  const dataRows = rows.length - headerIndex - 1;
  if (dataRows > MAX_IMPORT_ROWS) {
    return fail([{ row: 0, message: `The file has more than ${MAX_IMPORT_ROWS} rows.` }]);
  }

  const learners = new Map(context.learners.map((l) => [numberKey(l.learnerNumber), l]));
  const seen = new Map<string, number>();
  const marks: MarkWrite[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (isBlank(cells)) continue;
    const row = i + 1;
    summary.learners++;

    const number = cellInput(cells[numberAt]);
    if (!number) {
      errors.push({ row, message: "The learner number is missing." });
      continue;
    }
    const earlier = seen.get(numberKey(number));
    if (earlier !== undefined) {
      errors.push({ row, message: `Learner number ${number} is also on row ${earlier}.` });
      continue;
    }
    seen.set(numberKey(number), row);

    const learner = learners.get(numberKey(number));
    if (!learner) {
      errors.push({ row, message: `Learner number ${number} is not in ${context.className}.` });
      continue;
    }
    if (!learner.takesSubject) {
      errors.push({
        row,
        message: `${learner.name} (${learner.learnerNumber}) does not take ${context.subjectName}.`,
      });
      continue;
    }
    if (!learner.stillInClass) {
      errors.push({
        row,
        message: `${learner.name} (${learner.learnerNumber}) has left the class, so their marks are read-only. Remove the row.`,
      });
      continue;
    }

    for (const { at, assessment } of columns) {
      const value = parseCell(cellInput(cells[at]), assessment.maxMark);
      if (value.kind === "empty") continue;
      if (value.kind === "invalid") {
        errors.push({ row, message: `${assessment.name}: ${value.message}` });
        continue;
      }
      const mark: MarkWrite = {
        assessmentId: assessment.id,
        enrolmentId: learner.enrolmentId,
        status: value.kind === "score" ? "present" : value.kind,
        score: value.kind === "score" ? value.score : null,
      };
      const existing = context.existing[`${assessment.id}:${learner.enrolmentId}`];
      if (sameMark(existing, mark)) {
        summary.unchanged++;
        continue;
      }
      if (!assessment.writable) {
        errors.push({
          row,
          message: `${assessment.name} is locked, so its marks cannot change. Leave its column as downloaded.`,
        });
        continue;
      }
      if (existing) summary.changedMarks++;
      else summary.newMarks++;
      marks.push(mark);
    }
  }

  if (summary.learners === 0) return fail([{ row: 0, message: "The file has no learner rows." }]);
  if (errors.length) return { errors, marks: [], summary };
  return { errors, marks, summary };
}
