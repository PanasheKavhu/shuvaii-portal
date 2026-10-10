import { describe, expect, it } from "vitest";
import {
  O_LEVEL_BANDS,
  PRIMARY_BANDS,
  checkBands,
  describeBandProblem,
  gradeFor,
  parseBands,
  type BandInput,
} from "@/lib/setup/bands";

const rows = (...bands: [string, number | string, number | string][]): BandInput[] =>
  bands.map(([grade, minMark, maxMark]) => ({ grade, minMark, maxMark }));

describe("checkBands", () => {
  it("accepts the O-level and primary templates", () => {
    expect(checkBands(O_LEVEL_BANDS)).toEqual([]);
    expect(checkBands(PRIMARY_BANDS)).toEqual([]);
  });

  it("reports a gap as a run of marks", () => {
    const problems = checkBands(rows(["A", 50, 100], ["U", 0, 39]));
    expect(problems).toEqual([{ kind: "gap", from: 40, to: 49 }]);
    expect(describeBandProblem(problems[0]!)).toBe("Gap: marks 40 to 49 are in no band.");
  });

  it("reports an overlap with the grades involved", () => {
    const problems = checkBands(rows(["A", 70, 100], ["B", 60, 70], ["U", 0, 59]));
    expect(problems).toEqual([{ kind: "overlap", from: 70, to: 70, grades: ["A", "B"] }]);
    expect(describeBandProblem(problems[0]!)).toBe(
      "Overlap: mark 70 is in more than one band (A and B).",
    );
  });

  it("lists gaps and overlaps in mark order", () => {
    expect(checkBands(rows(["A", 90, 100], ["B", 50, 95], ["U", 1, 39]))).toEqual([
      { kind: "gap", from: 0, to: 0 },
      { kind: "gap", from: 40, to: 49 },
      { kind: "overlap", from: 90, to: 95, grades: ["A", "B"] },
    ]);
  });

  it("reports a band out of range", () => {
    const problems = checkBands(rows(["A", 70, 110], ["U", 0, 69]));
    expect(problems).toEqual([{ kind: "out-of-range", row: 1, grade: "A" }]);
    expect(describeBandProblem(problems[0]!)).toMatch(/Out of range: A \(row 1\)/);
    expect(checkBands(rows(["A", -1, 100]))).toEqual([
      { kind: "out-of-range", row: 1, grade: "A" },
    ]);
  });

  it("reports reversed, non-whole and missing values", () => {
    expect(checkBands(rows(["A", 100, 0]))).toEqual([{ kind: "reversed", row: 1, grade: "A" }]);
    expect(checkBands(rows(["A", "4.5", 100]))).toEqual([
      { kind: "not-whole", row: 1, grade: "A" },
    ]);
    expect(checkBands(rows(["A", "", 100]))).toEqual([{ kind: "not-whole", row: 1, grade: "A" }]);
    expect(checkBands(rows([" ", 0, 100]))).toEqual([{ kind: "missing-grade", row: 1 }]);
  });

  it("reports a grade used twice, ignoring case", () => {
    expect(checkBands(rows(["A", 50, 100], ["a", 0, 49]))).toEqual([
      { kind: "duplicate-grade", grade: "A" },
    ]);
  });

  it("reports an empty scale", () => {
    expect(checkBands([])).toEqual([{ kind: "empty" }]);
  });
});

describe("parseBands", () => {
  it("returns numbers, highest band first, with empty remarks as null", () => {
    expect(
      parseBands([
        { grade: " U ", minMark: "0", maxMark: "49", remark: " " },
        { grade: "A", minMark: "50", maxMark: "100", remark: "Well done" },
      ]),
    ).toEqual({
      ok: true,
      value: [
        { grade: "A", minMark: 50, maxMark: 100, remark: "Well done" },
        { grade: "U", minMark: 0, maxMark: 49, remark: null },
      ],
    });
  });

  it("returns the problems when the bands are wrong", () => {
    expect(parseBands(rows(["A", 50, 100]))).toEqual({
      ok: false,
      problems: [{ kind: "gap", from: 0, to: 49 }],
    });
  });
});

describe("gradeFor", () => {
  it("grades boundary marks with both ends included (Q1)", () => {
    expect(gradeFor(O_LEVEL_BANDS, 70)).toBe("A");
    expect(gradeFor(O_LEVEL_BANDS, 69)).toBe("B");
    expect(gradeFor(O_LEVEL_BANDS, 45)).toBe("D");
    expect(gradeFor(O_LEVEL_BANDS, 0)).toBe("U");
  });

  it("picks the highest band where bands overlap, in any order (as the database, D37)", () => {
    const overlapping = [
      { grade: "C", minMark: 50, maxMark: 60, remark: null },
      { grade: "B", minMark: 60, maxMark: 69, remark: null },
      { grade: "U", minMark: 0, maxMark: 49, remark: null },
    ];
    expect(gradeFor(overlapping, 60)).toBe("B");
    expect(gradeFor([...overlapping].reverse(), 60)).toBe("B");
    expect(gradeFor(overlapping, 59)).toBe("C");
    expect(gradeFor(overlapping, 75)).toBeNull();
  });
});
