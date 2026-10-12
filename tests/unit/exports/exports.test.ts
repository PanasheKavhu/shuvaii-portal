import { describe, expect, it } from "vitest";
import { describeAuditEntry, type AuditEntry } from "@/lib/audit/describe";
import { isSameOrigin, parseExportForm } from "@/lib/exports/input";
import {
  commentsSheet,
  exportFileName,
  learnersSheet,
  marksSheet,
  type CommentsDoc,
  type LearnersDoc,
  type MarksDoc,
} from "@/lib/exports/sheets";
import { readXlsx } from "@/lib/people/xlsx";
import { writeXlsx, xlsxStream, type XlsxSheet } from "@/lib/people/xlsx-write";

const A = "a5a00000-0000-0000-0000-000000000001";
const B = "a5a00000-0000-0000-0000-000000000002";

const learners: LearnersDoc = {
  rows: [
    {
      learner_number: "0042",
      last_name: "Ncube",
      first_name: "Tendai",
      date_of_birth: "2010-03-02",
      sex: "M",
      status: "active",
      admission_date: null,
      class_name: "4 Blue",
      year_label: "2026",
      guardians: [
        {
          full_name: "Pat Ncube",
          relationship: "father",
          phone: "+263771000001",
          email: "pat@example.test",
          is_primary: true,
        },
        {
          full_name: "Grace Ncube",
          relationship: "aunt",
          phone: null,
          email: null,
          is_primary: false,
        },
      ],
    },
    {
      learner_number: "0043",
      last_name: '=HYPERLINK("http://x")',
      first_name: "Ruva",
      date_of_birth: null,
      sex: null,
      status: "left",
      admission_date: null,
      class_name: null,
      year_label: null,
      guardians: [],
    },
  ],
};

const marks: MarksDoc = {
  class_name: "4 Blue",
  term_name: "Term 3",
  year_label: "2026",
  columns: [
    { id: B, subject: "English", assessment: "Exam", max_mark: 100 },
    { id: A, subject: "Mathematics", assessment: "Test 1", max_mark: 30 },
  ],
  rows: [
    {
      learner_number: "A002",
      last_name: "Left",
      first_name: "Ruva",
      status: "left",
      marks: { [A]: "E" },
    },
    {
      learner_number: "A001",
      last_name: "Ncube",
      first_name: "Tendai",
      status: "enrolled",
      marks: { [A]: 21.5, [B]: "A" },
    },
  ],
};

const comments: CommentsDoc = {
  class_name: "4 Blue",
  term_name: "Term 3",
  year_label: "2026",
  columns: [
    { id: "cs-eng", subject: "English" },
    { id: "cs-math", subject: "Mathematics" },
  ],
  rows: [
    {
      learner_number: "A001",
      last_name: "Ncube",
      first_name: "Tendai",
      status: "enrolled",
      subjects: { "cs-math": "-Needs to show working" },
      class_comment: "A good term.",
    },
  ],
};

const rowsOf = (sheet: XlsxSheet) => [...sheet.rows].map((r) => [...r]);

describe("learnersSheet", () => {
  it("has one row per learner and a block of columns per guardian, primary first", () => {
    const rows = rowsOf(learnersSheet(learners));
    expect(rows[0]).toEqual([
      "Learner number",
      "Surname",
      "First name",
      "Date of birth",
      "Sex",
      "Status",
      "Admission date",
      "Class",
      "Year",
      "Guardian 1 name",
      "Guardian 1 relationship",
      "Guardian 1 phone",
      "Guardian 1 email",
      "Guardian 1 primary",
      "Guardian 2 name",
      "Guardian 2 relationship",
      "Guardian 2 phone",
      "Guardian 2 email",
      "Guardian 2 primary",
    ]);
    expect(rows[1]).toEqual([
      "0042",
      "Ncube",
      "Tendai",
      "2010-03-02",
      "M",
      "Active",
      null,
      "4 Blue",
      "2026",
      "Pat Ncube",
      "father",
      "+263771000001",
      "pat@example.test",
      "Yes",
      "Grace Ncube",
      "aunt",
      null,
      null,
      "No",
    ]);
    expect(rows).toHaveLength(3);
  });

  it("escapes a name Excel would run as a formula, but not a phone number (D37)", () => {
    const rows = rowsOf(learnersSheet(learners));
    expect(rows[2]![1]).toBe('\'=HYPERLINK("http://x")');
    expect(rows[2]![5]).toBe("Left");
    expect(rows[2]!.slice(9)).toEqual(Array(10).fill(null));
  });

  it("keeps one guardian block when no learner has a guardian", () => {
    const sheet = learnersSheet({ rows: [] });
    expect(rowsOf(sheet)).toEqual([expect.arrayContaining(["Guardian 1 name"])]);
    expect(rowsOf(sheet)[0]).toHaveLength(14);
  });
});

describe("marksSheet", () => {
  it("has a column per subject and assessment with its maximum, and marks as numbers", () => {
    const rows = rowsOf(marksSheet(marks));
    expect(rows).toEqual([
      [
        "Learner number",
        "Surname",
        "First name",
        "Enrolment",
        "English: Exam (out of 100)",
        "Mathematics: Test 1 (out of 30)",
      ],
      ["A002", "Left", "Ruva", "Left", null, "E"],
      ["A001", "Ncube", "Tendai", "Enrolled", "A", 21.5],
    ]);
  });

  it("is only the learner columns when the class has no assessments", () => {
    expect(rowsOf(marksSheet({ ...marks, columns: [] }))[0]).toEqual([
      "Learner number",
      "Surname",
      "First name",
      "Enrolment",
    ]);
  });
});

describe("commentsSheet", () => {
  it("has a column per subject and the class teacher's, comments escaped", () => {
    expect(rowsOf(commentsSheet(comments))).toEqual([
      [
        "Learner number",
        "Surname",
        "First name",
        "Enrolment",
        "English comment",
        "Mathematics comment",
        "Class teacher's comment",
      ],
      ["A001", "Ncube", "Tendai", "Enrolled", null, "'-Needs to show working", "A good term."],
    ]);
  });
});

describe("the written file", () => {
  it("reads back as the same rows, streamed or whole", async () => {
    const sheet = marksSheet(marks);
    const streamed = new Uint8Array(await new Response(xlsxStream(sheet)).arrayBuffer());
    const whole = writeXlsx(sheet);
    expect(streamed).toEqual(whole);
    const back = readXlsx(streamed);
    expect(back[0]![4]).toBe("English: Exam (out of 100)");
    expect(back[2]!.slice(0, 6)).toEqual(["A001", "Ncube", "Tendai", "Enrolled", "A", 21.5]);
  });

  it("streams a large sheet in several chunks that read back whole", async () => {
    const big = learnersSheet({
      rows: Array.from({ length: 1000 }, (_, i) => ({
        ...learners.rows[0]!,
        learner_number: String(i).padStart(5, "0"),
      })),
    });
    const reader = xlsxStream(big).getReader();
    const parts: Uint8Array[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
    expect(parts.length).toBeGreaterThan(10);
    const back = readXlsx(new Uint8Array(Buffer.concat(parts)));
    expect(back).toHaveLength(1001);
    expect(back[1000]![0]).toBe("00999");
  });
});

describe("exportFileName", () => {
  it("makes a plain lower-case name", () => {
    expect(exportFileName(["marks", "4 Blue", "Term 3", "2026"])).toBe(
      "marks-4-blue-term-3-2026.xlsx",
    );
    expect(exportFileName(["comments", 'Form "1" / A', null])).toBe("comments-form-1-a.xlsx");
    expect(exportFileName([])).toBe("export.xlsx");
  });
});

describe("parseExportForm", () => {
  const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

  it("accepts learners on its own and a class export with a class and term", () => {
    expect(parseExportForm(form({ kind: "learners" }))).toEqual({ kind: "learners" });
    expect(parseExportForm(form({ kind: "marks", class: A, term: B }))).toEqual({
      kind: "marks",
      classId: A,
      termId: B,
    });
    expect(parseExportForm(form({ kind: "comments", class: A, term: B }))?.kind).toBe("comments");
  });

  it("refuses an unknown kind or a missing or malformed class or term", () => {
    expect(parseExportForm(form({ kind: "staff" }))).toBeNull();
    expect(parseExportForm(form({}))).toBeNull();
    expect(parseExportForm(form({ kind: "marks", class: A }))).toBeNull();
    expect(parseExportForm(form({ kind: "marks", class: "x", term: B }))).toBeNull();
    expect(parseExportForm(form({ kind: "comments", class: A, term: `${B}'` }))).toBeNull();
  });
});

describe("isSameOrigin", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("allows the portal's own pages and requests with no Origin", () => {
    expect(
      isSameOrigin(h({ origin: "https://sp.test", host: "sp.test" }), "https://sp.test/x"),
    ).toBe(true);
    expect(isSameOrigin(h({ host: "sp.test" }), "https://sp.test/x")).toBe(true);
  });
  it("refuses another site's form and a malformed Origin", () => {
    expect(
      isSameOrigin(h({ origin: "https://evil.test", host: "sp.test" }), "https://sp.test/x"),
    ).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "sp.test" }), "https://sp.test/x")).toBe(false);
  });
});

describe("describeAuditEntry: exports", () => {
  const base: AuditEntry = {
    id: 1,
    createdAt: "2026-10-12T10:00:00Z",
    table: "schools",
    action: "event",
    event: "data_exported",
    reason: null,
    oldData: null,
    newData: null,
    actorName: "Alice Admin",
    learnerName: null,
    learnerNumber: null,
    className: null,
    subjectName: null,
    assessmentName: null,
    personName: "Msasa Primary",
    otherClassName: null,
  };

  it("says who exported what and how many learners", () => {
    expect(describeAuditEntry({ ...base, newData: { kind: "learners", rows: 412 } })).toEqual({
      summary: "Alice Admin exported the learners and guardians to Excel (412 learners)",
      changes: [],
      reason: null,
    });
    expect(
      describeAuditEntry({
        ...base,
        className: "4 Blue",
        newData: { kind: "marks", rows: 1, class_name: "4 Blue", term_name: "Term 3" },
      }).summary,
    ).toBe("Alice Admin exported 4 Blue's Term 3 marks to Excel (1 learner)");
    expect(
      describeAuditEntry({
        ...base,
        className: "4 Blue",
        newData: { kind: "comments", rows: 38, class_name: "4 Blue", term_name: "Term 3" },
      }).summary,
    ).toBe("Alice Admin exported 4 Blue's Term 3 comments to Excel (38 learners)");
  });
});
