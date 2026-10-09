import { describe, expect, it } from "vitest";
import {
  assessmentHeading,
  cellInput,
  marksTemplateRows,
  planMarksUpload,
  type UploadContext,
} from "@/lib/marks/upload";
import { toCsvLine } from "@/lib/people/csv";
import { readUpload } from "@/lib/people/upload";
import { writeXlsx } from "@/lib/people/xlsx-write";
import { buildXlsx } from "../people/xlsx-fixture";

const T1 = "00000000-0000-0000-0000-0000000000a1";
const EX = "00000000-0000-0000-0000-0000000000a2";
const E = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

const context: UploadContext = {
  subjectName: "Mathematics",
  className: "3 Green",
  assessments: [
    { id: T1, name: "Test 1", maxMark: "30", writable: true },
    { id: EX, name: "Exam", maxMark: "100", writable: true },
  ],
  learners: [
    {
      enrolmentId: E(1),
      learnerNumber: "L001",
      name: "Tariro Moyo",
      takesSubject: true,
      stillInClass: true,
    },
    {
      enrolmentId: E(2),
      learnerNumber: "L002",
      name: "Kuda Ncube",
      takesSubject: true,
      stillInClass: true,
    },
    {
      enrolmentId: E(3),
      learnerNumber: "L003",
      name: "Rudo Dube",
      takesSubject: false,
      stillInClass: true,
    },
    {
      enrolmentId: E(4),
      learnerNumber: "L004",
      name: "Farai Sibanda",
      takesSubject: true,
      stillInClass: false,
    },
  ],
  existing: { [`${T1}:${E(1)}`]: { status: "present", score: 20 } },
};

const header = ["learner_number", "learner_name", "Test 1 (out of 30)", "Exam (out of 100)"];

describe("marks template", () => {
  it("has a header with each maximum and one row per learner taking the subject", () => {
    expect(marksTemplateRows(context)).toEqual([
      header,
      ["L001", "Tariro Moyo", "20", ""],
      ["L002", "Kuda Ncube", "", ""],
    ]);
    expect(assessmentHeading({ name: "Exam", maxMark: "100" })).toBe("Exam (out of 100)");
  });

  it("round-trips as CSV and as .xlsx, and the untouched template changes nothing", () => {
    const rows = marksTemplateRows(context);
    const csv = new TextEncoder().encode(rows.map(toCsvLine).join("\r\n"));
    const xlsx = writeXlsx({ name: "Mathematics 3 Green", rows, widths: [14, 24, 18, 18] });
    for (const bytes of [csv, xlsx]) {
      const read = readUpload(bytes);
      if (!read.ok) throw new Error(read.error);
      expect(read.rows.map(trim)).toEqual(rows.map(trim));
      const plan = planMarksUpload(read.rows, context);
      expect(plan.errors).toEqual([]);
      expect(plan.marks).toEqual([]);
      expect(plan.summary).toEqual({ learners: 2, newMarks: 0, changedMarks: 0, unchanged: 1 });
    }
  });

  it("writes learner numbers as text, so leading zeros survive", () => {
    const read = readUpload(writeXlsx({ name: "x", rows: [["learner_number"], ["007"]] }));
    expect(read.ok && read.rows[1]).toEqual(["007"]);
  });
});

/** CSV keeps empty cells as "", .xlsx leaves them out: compare without trailing blanks. */
function trim(row: readonly (string | number | boolean | null)[]): (string | number | boolean)[] {
  const out = row.map((c) => c ?? "");
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

describe("planMarksUpload", () => {
  it("plans new and changed marks, A, E and decimals, and skips blanks and unchanged", () => {
    const plan = planMarksUpload(
      [
        header,
        ["L001", "Tariro Moyo", 20, "a"],
        ["L002", "Kuda Ncube", "12.5", "E"],
        [null, null, null, null],
      ],
      context,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.marks).toEqual([
      { assessmentId: EX, enrolmentId: E(1), status: "absent", score: null },
      { assessmentId: T1, enrolmentId: E(2), status: "present", score: "12.5" },
      { assessmentId: EX, enrolmentId: E(2), status: "excused", score: null },
    ]);
    expect(plan.summary).toEqual({ learners: 2, newMarks: 3, changedMarks: 0, unchanged: 1 });
  });

  it("counts a changed mark", () => {
    const plan = planMarksUpload([header, ["L001", "", "25", ""]], context);
    expect(plan.marks).toEqual([
      { assessmentId: T1, enrolmentId: E(1), status: "present", score: "25" },
    ]);
    expect(plan.summary.changedMarks).toBe(1);
  });

  it("lists every problem by row and plans nothing", () => {
    const plan = planMarksUpload(
      [
        header,
        ["L001", "Tariro", "31", "abc"],
        ["L999", "Nobody", "1", ""],
        ["l001", "Again", "1", ""],
        ["L003", "Rudo", "1", ""],
        ["L004", "Farai", "1", ""],
        ["", "No number", "1", ""],
        ["L002", "Kuda", "-2", "10.123"],
      ],
      context,
    );
    expect(plan.marks).toEqual([]);
    expect(plan.errors).toEqual([
      { row: 2, message: "Test 1: 31 is more than the maximum of 30." },
      { row: 2, message: "Exam: Type a number, A for absent or E for excused." },
      { row: 3, message: "Learner number L999 is not in 3 Green." },
      { row: 4, message: "Learner number l001 is also on row 2." },
      { row: 5, message: "Rudo Dube (L003) does not take Mathematics." },
      {
        row: 6,
        message:
          "Farai Sibanda (L004) has left the class, so their marks are read-only. Remove the row.",
      },
      { row: 7, message: "The learner number is missing." },
      { row: 8, message: "Test 1: A mark cannot be below 0." },
      { row: 8, message: "Exam: Use at most 2 decimal places." },
    ]);
  });

  it("refuses a change to a locked assessment but allows it unchanged", () => {
    const locked: UploadContext = {
      ...context,
      assessments: [{ ...context.assessments[0]!, writable: false }, context.assessments[1]!],
    };
    expect(planMarksUpload([header, ["L001", "", "20", "50"]], locked).errors).toEqual([]);
    expect(planMarksUpload([header, ["L001", "", "21", ""]], locked).errors).toEqual([
      {
        row: 2,
        message: "Test 1 is locked, so its marks cannot change. Leave its column as downloaded.",
      },
    ]);
  });

  it("checks the header", () => {
    expect(
      planMarksUpload(
        [
          ["learner_name", "Test 1 (out of 30)"],
          ["x", 1],
        ],
        context,
      ).errors,
    ).toEqual([
      { row: 1, message: 'Missing column "learner_number". Use the template\'s header row.' },
    ]);
    expect(
      planMarksUpload(
        [
          ["learner_number", "Quiz"],
          ["L001", 1],
        ],
        context,
      ).errors,
    ).toEqual([
      {
        row: 1,
        message:
          'Column "Quiz" is not an assessment of Mathematics this term. Download the template again.',
      },
    ]);
    expect(
      planMarksUpload([["learner_number", "Exam", "exam (out of 50)"]], context).errors,
    ).toEqual([{ row: 1, message: "Exam has two columns. Keep one." }]);
    expect(
      planMarksUpload(
        [
          ["learner_number", "learner_name"],
          ["L001", "x"],
        ],
        context,
      ).errors,
    ).toEqual([
      { row: 1, message: "No assessment columns. Download the template for Mathematics again." },
    ]);
    expect(planMarksUpload([], context).errors).toEqual([
      { row: 0, message: "The file is empty." },
    ]);
    expect(planMarksUpload([header], context).errors).toEqual([
      { row: 0, message: "The file has no learner rows." },
    ]);
  });

  it("matches headings loosely and reads an Excel file with numbers", () => {
    const bytes = buildXlsx([
      ["Learner No", "TEST 1", "exam"],
      ["L002", 12.300000000000001, 88],
    ]);
    const read = readUpload(bytes);
    if (!read.ok) throw new Error(read.error);
    const plan = planMarksUpload(read.rows, context);
    expect(plan.errors).toEqual([]);
    expect(plan.marks.map((m) => m.score)).toEqual(["12.3", "88"]);
  });

  it("reads cells as the grid would", () => {
    expect(cellInput(null)).toBe("");
    expect(cellInput(" 7 ")).toBe("7");
    expect(cellInput(0.1 + 0.2)).toBe("0.3");
  });
});
