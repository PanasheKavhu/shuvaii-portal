import { describe, expect, it } from "vitest";
import {
  USUAL_TERM_SET,
  USUAL_VACATION_SET,
  checkAssessmentSet,
  describeSet,
  parseAssessment,
  usualSet,
  weightMessage,
  weightTotal,
} from "@/lib/marks/assessments";

describe("the usual set", () => {
  it("is Test 1, Test 2 and Exam weighing 100 together", () => {
    expect(describeSet(USUAL_TERM_SET)).toBe("Test 1, Test 2 and Exam");
    expect(weightTotal(USUAL_TERM_SET.map((a) => a.weightPercent))).toBe(100);
    expect(USUAL_TERM_SET[0]).toMatchObject({ maxMark: "30", weightPercent: "20" });
  });

  it("is one mark out of 100 in a vacation term", () => {
    expect(usualSet("vacation")).toHaveLength(1);
    expect(weightTotal(usualSet("vacation").map((a) => a.weightPercent))).toBe(100);
  });
});

describe("parseAssessment", () => {
  const ok = { name: " Test  3 ", type: "test", maxMark: "40", weightPercent: "12.5" };

  it("accepts a good assessment", () => {
    expect(parseAssessment(ok)).toEqual({
      ok: true,
      value: { name: "Test 3", type: "test", maxMark: "40", weightPercent: "12.5" },
    });
  });

  it("names each bad field", () => {
    const result = parseAssessment({ name: "", type: "quiz", maxMark: "0", weightPercent: "101" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual([
        "maxMark",
        "name",
        "type",
        "weightPercent",
      ]);
    expect(parseAssessment({ ...ok, maxMark: "1001" }).ok).toBe(false);
    expect(parseAssessment({ ...ok, weightPercent: "-5" }).ok).toBe(false);
    expect(parseAssessment({ ...ok, weightPercent: "10.555" }).ok).toBe(false);
  });
});

describe("weights", () => {
  it("adds exactly", () => {
    expect(weightTotal(["33.33", "33.33", "33.34"])).toBe(100);
    expect(weightTotal([0.1, 0.2])).toBe(0.3);
    expect(weightTotal([])).toBe(0);
  });

  it("says how far from 100 the total is", () => {
    expect(weightMessage(100, 3)).toEqual({ ok: true, text: "Weights add up to 100." });
    expect(weightMessage(110, 3).text).toMatch(/^Weights add up to 110, 10 over 100\./);
    expect(weightMessage(80, 2).text).toMatch(/^Weights add up to 80, 20 short of 100\./);
    expect(weightMessage(0, 0).ok).toBe(false);
  });
});

describe("the school's usual set (D41)", () => {
  const row = (name: string, maxMark: string, weightPercent: string, type = "test") => ({
    name,
    type,
    maxMark,
    weightPercent,
  });

  it("uses the starting set until the school saves its own for that kind", () => {
    expect(usualSet("term")).toEqual(USUAL_TERM_SET);
    expect(usualSet("mock")).toEqual(USUAL_TERM_SET);
    expect(usualSet("vacation")).toEqual(USUAL_VACATION_SET);
    const saved = [
      {
        termKind: "term",
        name: "Coursework",
        type: "assignment" as const,
        maxMark: 40,
        weightPercent: 30,
      },
      {
        termKind: "term",
        name: "Exam",
        type: "exam" as const,
        maxMark: "100.00",
        weightPercent: "70",
      },
    ];
    expect(usualSet("term", saved)).toEqual([
      { name: "Coursework", type: "assignment", maxMark: "40", weightPercent: "30" },
      { name: "Exam", type: "exam", maxMark: "100", weightPercent: "70" },
    ]);
    expect(usualSet("vacation", saved)).toEqual(USUAL_VACATION_SET);
  });

  it("accepts a set whose weights add up to exactly 100", () => {
    const checked = checkAssessmentSet([
      row("Test 1", "30", "12.5"),
      row("Test 2", "50", "12.5"),
      row("Exam", "100", "75", "exam"),
    ]);
    expect(checked).toEqual({
      ok: true,
      value: [
        { name: "Test 1", type: "test", maxMark: "30", weightPercent: "12.5" },
        { name: "Test 2", type: "test", maxMark: "50", weightPercent: "12.5" },
        { name: "Exam", type: "exam", maxMark: "100", weightPercent: "75" },
      ],
    });
    expect(checkAssessmentSet(USUAL_TERM_SET).ok).toBe(true);
  });

  it("refuses weights that do not add up to 100", () => {
    expect(checkAssessmentSet([row("Test 1", "30", "20"), row("Exam", "100", "70")])).toEqual({
      ok: false,
      problems: ["Weights add up to 90, 10 short of 100."],
    });
    expect(checkAssessmentSet([row("Test 1", "30", "40"), row("Exam", "100", "70")])).toEqual({
      ok: false,
      problems: ["Weights add up to 110, 10 over 100."],
    });
  });

  it("names bad rows, repeated names and an empty set", () => {
    expect(checkAssessmentSet([])).toEqual({
      ok: false,
      problems: ["Add at least one assessment."],
    });
    expect(checkAssessmentSet([row("", "30", "50"), row("Exam", "0", "50", "quiz")])).toEqual({
      ok: false,
      problems: [
        "Row 1: Give the assessment a name.",
        "Row 2: Choose a type; Enter a maximum mark from 1 to 1000.",
      ],
    });
    expect(checkAssessmentSet([row("Exam", "100", "50"), row(" exam ", "100", "50")])).toEqual({
      ok: false,
      problems: ["exam is in the set more than once."],
    });
  });
});
