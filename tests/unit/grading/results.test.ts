import { describe, expect, it } from "vitest";
import { parseDecimal, roundHalfUp } from "@/lib/grading/decimal";
import {
  classAverage,
  classPositions,
  competitionRanks,
  subjectResult,
  weightsAreComplete,
  type AssessmentWithMark,
} from "@/lib/grading/results";
import { O_LEVEL_BANDS } from "@/lib/setup/bands";

const present = (score: number | string) => ({ status: "present" as const, score });
const single = (score: number | string): AssessmentWithMark[] => [
  { maxMark: 100, weightPercent: 100, mark: present(score) },
];

describe("roundHalfUp", () => {
  const r = (text: string, places = 0) => roundHalfUp(parseDecimal(text)!, places);

  it("rounds halves up and everything else to the nearest", () => {
    expect(r("69.5")).toBe(70);
    expect(r("69.49")).toBe(69);
    expect(r("39.5")).toBe(40);
    expect(r("0")).toBe(0);
    expect(r("52.825", 2)).toBe(52.83);
    expect(r("39.15", 1)).toBe(39.2);
  });

  it("is exact where floats are not", () => {
    // 1.005 * 100 is 100.49999999999999 as a float
    expect(r("1.005", 2)).toBe(1.01);
    expect(r("0.1", 1)).toBe(0.1);
  });
});

describe("parseDecimal", () => {
  it("reads non-negative decimals and refuses the rest", () => {
    expect(parseDecimal(" 20.5 ")).toEqual({ num: BigInt(205), den: BigInt(10) });
    expect(parseDecimal(7)).toEqual({ num: BigInt(7), den: BigInt(1) });
    for (const bad of ["", "-1", "abc", "1e3", "1.", ".5"]) expect(parseDecimal(bad)).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
  });
});

describe("subjectResult", () => {
  it("reproduces the worked example (GRADING_AND_WEIGHTS section 5)", () => {
    const result = subjectResult(
      [
        { maxMark: 30, weightPercent: 20, mark: present(21) },
        { maxMark: 50, weightPercent: 20, mark: present(33) },
        { maxMark: 100, weightPercent: 60, mark: present(62) },
      ],
      O_LEVEL_BANDS,
    );
    expect(result).toEqual({
      status: "complete",
      weightedPercent: 64.4,
      roundedMark: 64,
      grade: "B",
    });
  });

  it("grades the boundaries after rounding half up", () => {
    const grade = (score: string) => subjectResult(single(score), O_LEVEL_BANDS);
    expect(grade("69.5")).toMatchObject({ roundedMark: 70, grade: "A" });
    expect(grade("70")).toMatchObject({ roundedMark: 70, grade: "A" });
    expect(grade("69.49")).toMatchObject({ roundedMark: 69, grade: "B" });
    expect(grade("39.5")).toMatchObject({ roundedMark: 40, grade: "E" });
    expect(grade("0")).toMatchObject({ roundedMark: 0, grade: "U", weightedPercent: 0 });
  });

  it("gets exactly 69.5 from thirds that do not terminate", () => {
    // 20.85 / 30 * 100 is exactly 69.5; so is 2.08 / 3 * 50 + 2.09 / 3 * 50
    // (34.666... + 34.833...), the same case as 17_grade_calculations
    const result = subjectResult(
      [{ maxMark: 30, weightPercent: 100, mark: present("20.85") }],
      O_LEVEL_BANDS,
    );
    expect(result).toMatchObject({ weightedPercent: 69.5, roundedMark: 70, grade: "A" });
    const thirds = subjectResult(
      [
        { maxMark: 3, weightPercent: 50, mark: present("2.08") },
        { maxMark: 3, weightPercent: 50, mark: present("2.09") },
      ],
      O_LEVEL_BANDS,
    );
    expect(thirds).toMatchObject({ weightedPercent: 69.5, roundedMark: 70 });
  });

  it("is incomplete when the weights do not add up to 100", () => {
    const short: AssessmentWithMark[] = [
      { maxMark: 50, weightPercent: 40, mark: present(50) },
      { maxMark: 100, weightPercent: 50, mark: present(100) },
    ];
    expect(weightsAreComplete(short)).toBe(false);
    expect(subjectResult(short, O_LEVEL_BANDS)).toEqual({
      status: "incomplete",
      reason: "weights_not_100",
    });
    expect(weightsAreComplete([{ weightPercent: "33.3" }, { weightPercent: "66.7" }])).toBe(true);
  });

  it("is incomplete for an absence, an excusal or a missing mark (Q6)", () => {
    const withMark = (mark: AssessmentWithMark["mark"]): AssessmentWithMark[] => [
      { maxMark: 30, weightPercent: 40, mark: present(20) },
      { maxMark: 50, weightPercent: 60, mark },
    ];
    expect(subjectResult(withMark({ status: "absent" }), O_LEVEL_BANDS)).toEqual({
      status: "incomplete",
      reason: "absent",
    });
    expect(subjectResult(withMark({ status: "excused" }), O_LEVEL_BANDS)).toMatchObject({
      reason: "excused",
    });
    expect(subjectResult(withMark(null), O_LEVEL_BANDS)).toMatchObject({ reason: "missing_mark" });
    // half typed or out of range counts as no mark yet
    expect(subjectResult(withMark(present("4.")), O_LEVEL_BANDS)).toMatchObject({
      reason: "missing_mark",
    });
    expect(subjectResult(withMark(present(51)), O_LEVEL_BANDS)).toMatchObject({
      reason: "missing_mark",
    });
  });

  it("puts weights first, then absent, then excused", () => {
    const result = subjectResult(
      [
        { maxMark: 30, weightPercent: 40, mark: { status: "excused" } },
        { maxMark: 50, weightPercent: 50, mark: { status: "absent" } },
      ],
      O_LEVEL_BANDS,
    );
    expect(result).toMatchObject({ reason: "weights_not_100" });
  });

  it("has no result without assessments", () => {
    expect(subjectResult([], O_LEVEL_BANDS)).toBeNull();
  });
});

describe("classAverage", () => {
  it("is the mean of completed results to one decimal, half up", () => {
    expect(classAverage([53, 36, 36, 26, 49, 32, 42])).toBe(39.1);
    expect(classAverage([70, 69])).toBe(69.5);
    expect(classAverage([1, 2, 2, 2])).toBe(1.8); // 1.75
    expect(classAverage([])).toBeNull();
  });
});

describe("competitionRanks", () => {
  it("shares a position on a tie and skips the next (1, 2, 2, 4)", () => {
    expect(competitionRanks([80, 70.5, 70.5, 60])).toEqual([1, 2, 2, 4]);
    expect(competitionRanks([null, 50, 50])).toEqual([null, 1, 1]);
  });
});

describe("classPositions", () => {
  const learners = [
    { enrolmentId: "a", enrolmentStatus: "enrolled", completedMarks: [80, 60] },
    { enrolmentId: "b", enrolmentStatus: "enrolled", completedMarks: [70] },
    { enrolmentId: "c", enrolmentStatus: "left", completedMarks: [90] },
    { enrolmentId: "d", enrolmentStatus: "enrolled", completedMarks: [] },
    { enrolmentId: "e", enrolmentStatus: "enrolled", completedMarks: [65, 75] },
  ];

  it("ranks learners still in the class who have an average", () => {
    expect(classPositions(learners, "term")).toEqual([
      { enrolmentId: "a", subjectsCounted: 2, average: 70, position: 1, classSize: 4 },
      { enrolmentId: "b", subjectsCounted: 1, average: 70, position: 1, classSize: 4 },
      { enrolmentId: "c", subjectsCounted: 1, average: 90, position: null, classSize: 4 },
      { enrolmentId: "d", subjectsCounted: 0, average: null, position: null, classSize: 4 },
      { enrolmentId: "e", subjectsCounted: 2, average: 70, position: 1, classSize: 4 },
    ]);
  });

  it("gives vacation terms averages but no positions (Q8)", () => {
    const result = classPositions(learners, "vacation");
    expect(result.map((r) => r.position)).toEqual([null, null, null, null, null]);
    expect(result.map((r) => r.classSize)).toEqual([null, null, null, null, null]);
    expect(result[0]!.average).toBe(70);
  });
});
