/**
 * The report workflow in plain words (US-6.1 to US-6.3, US-5.4; D44). Pure:
 * the pages pass rows from public.report_gaps() and the reports' stored
 * snapshot. Limits mirror 20261011120000_report_workflow.sql and
 * 20261011140000_report_withdraw_and_reissue.sql.
 */

/** The head's comment: three lines beside the signature and stamp. */
export const HEAD_COMMENT_MAX = 200;
/** The note the head writes when returning reports. */
export const RETURN_NOTE_MAX = 500;
/** Why the head withdraws a published report (US-6.6). */
export const WITHDRAW_REASON_MAX = 500;

export type ReportStatus = "draft" | "submitted" | "approved" | "published" | "withdrawn";

export const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for the head",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && value in STATUS_LABELS;
}

// Gaps ------------------------------------------------------------------------------

export type ReportGap = {
  gap: string;
  subjectName: string | null;
  reason: string | null;
  assessmentNames: string[];
};

/** "Test", "Test and Exam", "Test 1, Test 2 and Exam". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** One gap as the class teacher reads it, saying exactly what is missing. */
export function describeGap(g: ReportGap): string {
  const subject = g.subjectName ?? "A subject";
  const which = g.assessmentNames.length ? ` ${joinNames(g.assessmentNames)}` : "";
  switch (g.gap) {
    case "no_results":
      return "No subject results this term";
    case "result":
      switch (g.reason) {
        case "missing_mark":
          return `${subject}: no mark for${which || " an assessment"}`;
        case "absent":
          return `${subject}: absent for${which || " an assessment"}`;
        case "excused":
          return `${subject}: excused from${which || " an assessment"}`;
        case "weights_not_100":
          return `${subject}: the assessment weights do not add up to 100%`;
        default:
          return `${subject}: no result yet`;
      }
    case "subject_comment":
      return g.reason === "not_done"
        ? `${subject}: teacher's comment not marked done`
        : `${subject}: no teacher's comment`;
    case "class_comment":
      return g.reason === "not_done"
        ? "Class teacher's comment not marked done"
        : "No class teacher's comment";
    default:
      return "Something is missing";
  }
}

/** Whether every gap is a subject without a result (a draft can still be made, D44). */
export function onlyResultGaps(gaps: readonly ReportGap[]): boolean {
  return gaps.length > 0 && gaps.every((g) => g.gap === "result");
}

// Outcomes --------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What "Generate draft reports" did, from public.generate_report_drafts() outcomes. */
export function describeGeneration(outcomes: readonly string[]): string {
  const count = (o: string) => outcomes.filter((x) => x === o).length;
  const made = count("created");
  const refreshed = count("refreshed");
  const missing = count("missing");
  const parts: string[] = [];
  if (made) parts.push(`Made ${plural(made, "draft report", "draft reports")}.`);
  if (refreshed) parts.push(`Refreshed ${plural(refreshed, "draft", "drafts")}.`);
  if (missing) parts.push(`${plural(missing, "learner is", "learners are")} missing something.`);
  if (!parts.length) {
    return outcomes.length
      ? "Every learner's report is already with the head or published."
      : "No learners in this class.";
  }
  return parts.join(" ");
}

// Snapshot --------------------------------------------------------------------------

export type ReportLine = {
  classSubjectId: string;
  subject: string;
  mark: number | null;
  grade: string | null;
  complete: boolean;
  reason: string | null;
  notAvailable: boolean;
  comment: string | null;
  teacher: string | null;
  signedAt: string | null;
};

export type ReportContent = {
  learnerName: string;
  learnerNumber: string | null;
  subjects: ReportLine[];
  average: number | null;
  position: number | null;
  classSize: number | null;
  classComment: string | null;
  headComment: string | null;
  referenceCode: string | null;
  gradingKey: { grade: string; minMark: number; maxMark: number }[];
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A report's stored snapshot (draft contents, or the frozen published one) as typed fields. */
export function readReportContent(snapshot: unknown): ReportContent {
  const s = obj(snapshot);
  const learner = obj(s.learner);
  const lines = Array.isArray(s.subjects) ? s.subjects : [];
  const bands = Array.isArray(obj(s.grading_key).bands)
    ? (obj(s.grading_key).bands as unknown[])
    : [];
  return {
    learnerName: str(learner.name) ?? "",
    learnerNumber: str(learner.learner_number),
    subjects: lines.map((raw) => {
      const l = obj(raw);
      return {
        classSubjectId: str(l.class_subject_id) ?? "",
        subject: str(l.subject) ?? "Subject",
        mark: num(l.mark),
        grade: str(l.grade),
        complete: l.status === "complete",
        reason: str(l.reason),
        notAvailable: l.not_available === true,
        comment: str(l.comment),
        teacher: str(l.teacher),
        signedAt: str(l.signed_at),
      };
    }),
    average: num(s.average),
    position: num(s.position),
    classSize: num(s.class_size),
    classComment: str(s.class_comment),
    headComment: str(s.head_comment),
    referenceCode: str(s.reference_code),
    gradingKey: bands.map((raw) => {
      const b = obj(raw);
      return {
        grade: str(b.grade) ?? "",
        minMark: num(b.min_mark) ?? 0,
        maxMark: num(b.max_mark) ?? 0,
      };
    }),
  };
}

/** Subject lines the head must still decide on before approving (REPORT_LAYOUT section 4). */
export function openGaps(content: ReportContent): ReportLine[] {
  return content.subjects.filter((l) => !l.complete && !l.notAvailable);
}
