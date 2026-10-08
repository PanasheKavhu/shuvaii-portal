import { describe, expect, it } from "vitest";
import {
  isIsoDate,
  nextYearLabel,
  parseTerm,
  parseYear,
  proposeCalendar,
  termClashes,
} from "@/lib/setup/calendar";

describe("proposeCalendar", () => {
  it("proposes three terms and a vacation period inside the year, all planned", () => {
    const { year, terms } = proposeCalendar("2027");
    expect(year).toEqual({ label: "2027", startsOn: "2027-01-13", endsOn: "2027-12-04" });
    expect(terms.map((t) => [t.name, t.kind])).toEqual([
      ["Term 1 2027", "term"],
      ["April 2027 Vacation School", "vacation"],
      ["Term 2 2027", "term"],
      ["Term 3 2027", "term"],
    ]);
    for (const t of terms) {
      expect(t.status).toBe("planned");
      expect(parseTerm(t, year).ok).toBe(true);
    }
    expect(termClashes(terms)).toEqual({ overlaps: [], duplicateNames: [] });
  });
});

describe("nextYearLabel", () => {
  it("follows the latest numeric label, or uses this year", () => {
    expect(nextYearLabel(["2025", "2026"], new Date("2026-10-08"))).toBe("2027");
    expect(nextYearLabel([], new Date("2026-10-08"))).toBe("2026");
    expect(nextYearLabel(["Pilot"], new Date("2026-10-08"))).toBe("2026");
  });
});

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2027-02-28")).toBe(true);
    expect(isIsoDate("2027-02-30")).toBe(false);
    expect(isIsoDate("27-02-01")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("parseYear", () => {
  it("accepts a valid year", () => {
    expect(parseYear({ label: " 2027 ", startsOn: "2027-01-13", endsOn: "2027-12-04" })).toEqual({
      ok: true,
      value: { label: "2027", startsOn: "2027-01-13", endsOn: "2027-12-04" },
    });
  });

  it("rejects a year that ends before it starts, and a missing label", () => {
    const parsed = parseYear({ label: "", startsOn: "2027-12-04", endsOn: "2027-01-13" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.label).toBeDefined();
      expect(parsed.errors.endsOn).toBe("The year must end after it starts.");
    }
  });
});

describe("parseTerm", () => {
  const year = { startsOn: "2027-01-13", endsOn: "2027-12-04" };
  const term = {
    name: "Term 1",
    kind: "term",
    startsOn: "2027-01-13",
    endsOn: "2027-04-09",
    marksDeadline: "2027-03-26",
    status: "open",
  };

  it("stores status and marks deadline (US-2.4)", () => {
    expect(parseTerm(term, year)).toEqual({ ok: true, value: term });
    expect(parseTerm({ ...term, marksDeadline: "" }, year)).toMatchObject({
      ok: true,
      value: { marksDeadline: null },
    });
  });

  it("rejects dates outside the year, reversed dates and an early deadline", () => {
    expect(parseTerm({ ...term, startsOn: "2027-01-01" }, year)).toMatchObject({
      ok: false,
      errors: { startsOn: expect.stringContaining("inside the year") },
    });
    expect(parseTerm({ ...term, endsOn: "2027-01-01" }, year)).toMatchObject({
      ok: false,
      errors: { endsOn: "The end date is before the start date." },
    });
    expect(parseTerm({ ...term, marksDeadline: "2027-01-01" }, year)).toMatchObject({
      ok: false,
      errors: { marksDeadline: "The marks deadline cannot be before the start date." },
    });
  });

  it("rejects an unknown kind or status", () => {
    expect(parseTerm({ ...term, kind: "holiday", status: "unlocked" }, year)).toMatchObject({
      ok: false,
      errors: { kind: expect.any(String), status: expect.any(String) },
    });
  });
});

describe("termClashes", () => {
  it("finds overlapping periods and repeated names", () => {
    expect(
      termClashes([
        { name: "Term 1", startsOn: "2027-01-13", endsOn: "2027-04-09" },
        { name: "Vacation", startsOn: "2027-04-09", endsOn: "2027-04-20" },
        { name: "term 1", startsOn: "2027-05-01", endsOn: "2027-08-01" },
      ]),
    ).toEqual({ overlaps: [{ first: "Term 1", second: "Vacation" }], duplicateNames: ["Term 1"] });
  });
});
