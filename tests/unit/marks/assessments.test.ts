import { describe, expect, it } from "vitest";
import {
  USUAL_TERM_SET,
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
