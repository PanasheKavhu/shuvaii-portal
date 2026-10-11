/**
 * A published report snapshot as publish_class_reports() stores it
 * (20261011120000_report_workflow.sql), for the PDF tests. `subjects` lines
 * and any top-level key can be overridden.
 */

/** A subject comment at the 100-character limit (D34). */
export const MAX_SUBJECT_COMMENT =
  "Works steadily and asks good questions; must now revise each topic weekly and complete all homework.";
if (MAX_SUBJECT_COMMENT.length !== 100)
  throw new Error("MAX_SUBJECT_COMMENT must be 100 characters");
export const MAX_CLASS_COMMENT = (
  "A settled and kind member of the class who leads by example in group work and assemblies. " +
  "Reading has improved this term and the written work is neat and complete. " +
  "Needs to speak up more in lessons and to check answers before handing work in. " +
  "Keep up the good effort next term and aim higher."
).slice(0, 300);
export const MAX_HEAD_COMMENT = (
  "An encouraging term. Keep working with the same care, ask for help early when a topic is hard, " +
  "and use the holiday to read widely and revise Mathematics and the sciences every week."
).slice(0, 200);

export const SUBJECT_NAMES = [
  "English Language",
  "English Literature",
  "Mathematics",
  "Shona",
  "History",
  "Geography",
  "Accounting",
  "Business Studies",
  "Biology",
  "Chemistry",
  "Physics",
  "Computer Studies",
] as const;

export type SnapshotLine = Record<string, unknown>;

export function subjectLine(name: string, i: number, overrides: SnapshotLine = {}): SnapshotLine {
  const mark = 40 + ((i * 7) % 55);
  return {
    class_subject_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    subject: name,
    mark,
    grade: mark >= 70 ? "A" : mark >= 60 ? "B" : mark >= 50 ? "C" : mark >= 45 ? "D" : "E",
    remark: null,
    status: "complete",
    reason: null,
    comment: "Good progress this term.",
    teacher: `Teacher ${i + 1}`,
    signed_at: "2026-04-02T09:00:00+02:00",
    not_available: false,
    ...overrides,
  };
}

export function publishedSnapshot(
  overrides: Record<string, unknown> = {},
  sections: Record<string, boolean> = {},
): Record<string, unknown> {
  return {
    learner: {
      name: "Tendai Ncube",
      first_name: "Tendai",
      last_name: "Ncube",
      learner_number: "MS2026-014",
    },
    class: "4 Blue",
    grade_level: "Form 4",
    year: "2026",
    term: { name: "Term 1 2026", kind: "term", starts_on: "2026-01-13", ends_on: "2026-04-09" },
    kind: "term",
    subjects: SUBJECT_NAMES.slice(0, 3).map((n, i) => subjectLine(n, i)),
    average: 64.3,
    position: 12,
    class_size: 30,
    class_comment: "A good term overall.",
    head_comment: "Well done.",
    generated_at: "2026-04-03T08:00:00+02:00",
    template: {
      name: "Term report",
      sections: {
        subject_comments: true,
        teacher_signature: true,
        average_position: true,
        attendance: false,
        class_comment: true,
        head_comment: true,
        head_signature: true,
        school_stamp: true,
        grading_key: true,
        legal_line: true,
        verification: true,
        ...sections,
      },
      footer_text: "This report is issued without erasure or amendments.",
      comment_label: "Teacher's comment",
    },
    grading_key: {
      scale: "O-Level",
      level: "Form 4",
      bands: [
        ["A", 70, 100],
        ["B", 60, 69],
        ["C", 50, 59],
        ["D", 45, 49],
        ["E", 40, 44],
        ["U", 0, 39],
      ].map(([grade, min, max]) => ({ grade, min_mark: min, max_mark: max, remark: null })),
    },
    school: {
      name: "Msasa Demo High School",
      motto: "Excellence in all things",
      address: "12 Msasa Road, Harare",
      phone: "+263 242 000 000",
      email: "office@msasa.demo",
      logo_path: null,
      primary_color: "#0b5fa5",
      accent_color: "#f2a900",
      footer_text: null,
      stamp_path: null,
      head_signature_path: null,
    },
    head_name: "Mrs P. Dube",
    reference_code: "ABCD2345EF",
    verification_code: "QRSTUVWXYZ23456789ABCDEF",
    version: 1,
    published_at: "2026-04-05T10:00:00+02:00",
    ...overrides,
  };
}
