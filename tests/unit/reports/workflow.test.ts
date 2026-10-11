import { describe, expect, it } from "vitest";
import {
  describeGap,
  describeGeneration,
  joinNames,
  onlyResultGaps,
  openGaps,
  readReportContent,
  type ReportGap,
} from "@/lib/reports/workflow";

const gap = (g: Partial<ReportGap>): ReportGap => ({
  gap: "result",
  subjectName: "Mathematics",
  reason: "missing_mark",
  assessmentNames: [],
  ...g,
});

describe("joinNames", () => {
  it("joins names in plain words", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Test"])).toBe("Test");
    expect(joinNames(["Test", "Exam"])).toBe("Test and Exam");
    expect(joinNames(["Test 1", "Test 2", "Exam"])).toBe("Test 1, Test 2 and Exam");
  });
});

describe("describeGap (US-6.1: exactly what is missing)", () => {
  it("names the subject and the assessments without a mark", () => {
    expect(describeGap(gap({ assessmentNames: ["Test 2", "Exam"] }))).toBe(
      "Mathematics: no mark for Test 2 and Exam",
    );
    expect(describeGap(gap({ reason: "absent", assessmentNames: ["Exam"] }))).toBe(
      "Mathematics: absent for Exam",
    );
    expect(describeGap(gap({ reason: "excused", assessmentNames: ["Exam"] }))).toBe(
      "Mathematics: excused from Exam",
    );
    expect(describeGap(gap({ reason: "weights_not_100" }))).toBe(
      "Mathematics: the assessment weights do not add up to 100%",
    );
  });

  it("says whether a comment is missing or only not marked done", () => {
    expect(
      describeGap(gap({ gap: "subject_comment", subjectName: "English", reason: "missing" })),
    ).toBe("English: no teacher's comment");
    expect(
      describeGap(gap({ gap: "subject_comment", subjectName: "English", reason: "not_done" })),
    ).toBe("English: teacher's comment not marked done");
    expect(describeGap(gap({ gap: "class_comment", subjectName: null, reason: "missing" }))).toBe(
      "No class teacher's comment",
    );
    expect(describeGap(gap({ gap: "class_comment", subjectName: null, reason: "not_done" }))).toBe(
      "Class teacher's comment not marked done",
    );
    expect(describeGap(gap({ gap: "no_results", subjectName: null, reason: null }))).toBe(
      "No subject results this term",
    );
  });

  it("knows when only results are missing", () => {
    expect(onlyResultGaps([gap({})])).toBe(true);
    expect(onlyResultGaps([gap({}), gap({ gap: "class_comment" })])).toBe(false);
    expect(onlyResultGaps([])).toBe(false);
  });
});

describe("describeGeneration", () => {
  it("counts what was made, refreshed and skipped", () => {
    expect(describeGeneration(["created", "created", "missing"])).toBe(
      "Made 2 draft reports. 1 learner is missing something.",
    );
    expect(describeGeneration(["refreshed", "created", "missing", "missing"])).toBe(
      "Made 1 draft report. Refreshed 1 draft. 2 learners are missing something.",
    );
    expect(describeGeneration(["submitted", "published"])).toBe(
      "Every learner's report is already with the head or published.",
    );
    expect(describeGeneration([])).toBe("No learners in this class.");
  });
});

describe("readReportContent", () => {
  const snapshot = {
    learner: { name: "Lungi Moyo", learner_number: "W-01" },
    subjects: [
      {
        class_subject_id: "cs1",
        subject: "Mathematics",
        mark: 80,
        grade: "A",
        status: "complete",
        comment: "Good work.",
        teacher: "Mr Moyo",
        signed_at: "2026-10-01T08:00:00Z",
        not_available: false,
      },
      {
        class_subject_id: "cs2",
        subject: "English",
        mark: null,
        status: "incomplete",
        reason: "missing_mark",
      },
    ],
    average: 72.5,
    position: 2,
    class_size: 30,
    class_comment: "A fine term.",
    head_comment: "Keep it up.",
    reference_code: "ABCDEFGH23",
    grading_key: { bands: [{ grade: "A", min_mark: 70, max_mark: 100 }] },
  };

  it("reads a snapshot into typed fields", () => {
    const c = readReportContent(snapshot);
    expect(c.learnerName).toBe("Lungi Moyo");
    expect(c.subjects[0]).toMatchObject({
      subject: "Mathematics",
      mark: 80,
      grade: "A",
      complete: true,
    });
    expect(c.subjects[1]).toMatchObject({
      complete: false,
      reason: "missing_mark",
      notAvailable: false,
    });
    expect(c).toMatchObject({
      average: 72.5,
      position: 2,
      classSize: 30,
      referenceCode: "ABCDEFGH23",
    });
    expect(c.gradingKey).toEqual([{ grade: "A", minMark: 70, maxMark: 100 }]);
  });

  it("lists subjects the head still has to decide on", () => {
    expect(openGaps(readReportContent(snapshot)).map((l) => l.subject)).toEqual(["English"]);
    const decided = { ...snapshot, subjects: [{ ...snapshot.subjects[1], not_available: true }] };
    expect(openGaps(readReportContent(decided))).toEqual([]);
  });

  it("tolerates a missing or odd snapshot", () => {
    expect(readReportContent(null)).toMatchObject({ learnerName: "", subjects: [], average: null });
    expect(readReportContent({ subjects: "x" }).subjects).toEqual([]);
  });
});
