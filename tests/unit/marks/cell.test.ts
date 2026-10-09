import { describe, expect, it } from "vitest";
import { subjectResult } from "@/lib/grading/results";
import { cellMark, cellText, describeIncomplete, parseCell } from "@/lib/marks/cell";
import { O_LEVEL_BANDS } from "@/lib/setup/bands";

describe("parseCell", () => {
  it("reads scores from 0 to the maximum", () => {
    expect(parseCell("0", 30)).toEqual({ kind: "score", score: "0" });
    expect(parseCell(" 21 ", 30)).toEqual({ kind: "score", score: "21" });
    expect(parseCell("30", 30)).toEqual({ kind: "score", score: "30" });
    expect(parseCell("29.5", "30")).toEqual({ kind: "score", score: "29.5" });
    expect(parseCell("07.50", 30)).toEqual({ kind: "score", score: "7.5" });
  });

  it("refuses a mark above the maximum", () => {
    expect(parseCell("31", 30)).toEqual({
      kind: "invalid",
      message: "31 is more than the maximum of 30.",
    });
    expect(parseCell("30.01", 30).kind).toBe("invalid");
  });

  it("refuses a mark below zero", () => {
    expect(parseCell("-1", 30)).toEqual({ kind: "invalid", message: "A mark cannot be below 0." });
  });

  it("refuses text that is not a mark, and more than two decimals", () => {
    expect(parseCell("abc", 30).kind).toBe("invalid");
    expect(parseCell("1e2", 30).kind).toBe("invalid");
    expect(parseCell("12.345", 30)).toEqual({
      kind: "invalid",
      message: "Use at most 2 decimal places.",
    });
  });

  it("reads A and E as absent and excused, and blank as empty", () => {
    for (const t of ["A", "a", "abs", "Absent"])
      expect(parseCell(t, 30)).toEqual({ kind: "absent" });
    for (const t of ["E", "e", "exc", "excused"])
      expect(parseCell(t, 30)).toEqual({ kind: "excused" });
    expect(parseCell("  ", 30)).toEqual({ kind: "empty" });
  });
});

describe("cellText and cellMark", () => {
  it("shows saved marks", () => {
    expect(cellText({ status: "present", score: 20 })).toBe("20");
    expect(cellText({ status: "present", score: "20.50" })).toBe("20.5");
    expect(cellText({ status: "absent", score: null })).toBe("A");
    expect(cellText({ status: "excused", score: null })).toBe("E");
    expect(cellText(null)).toBe("");
  });

  it("feeds the live result", () => {
    const assessments = [
      { maxMark: 30, weightPercent: 20, mark: cellMark(parseCell("21", 30)) },
      { maxMark: 50, weightPercent: 20, mark: cellMark(parseCell("33", 50)) },
      { maxMark: 100, weightPercent: 60, mark: cellMark(parseCell("62", 100)) },
    ];
    // The worked example in GRADING_AND_WEIGHTS section 5.
    expect(subjectResult(assessments, O_LEVEL_BANDS)).toMatchObject({
      status: "complete",
      roundedMark: 64,
      grade: "B",
    });
    assessments[1]!.mark = cellMark(parseCell("A", 50));
    expect(subjectResult(assessments, O_LEVEL_BANDS)).toEqual({
      status: "incomplete",
      reason: "absent",
    });
    expect(cellMark(parseCell("99", 50))).toBeNull();
  });
});

describe("describeIncomplete", () => {
  it("names the reason", () => {
    expect(describeIncomplete("weights_not_100")).toBe("Incomplete: weights do not add up to 100");
    expect(describeIncomplete("absent")).toBe("Incomplete: absent");
    expect(describeIncomplete(null)).toBe("Incomplete");
  });
});
