import { describe, expect, it } from "vitest";
import {
  cleanSearch,
  countReports,
  describeReports,
  groupHits,
  hitCount,
  hrefForHit,
  noReports,
  parseGuardianFilter,
  parsePage,
  reportTotals,
  rolesText,
  totalReports,
} from "@/lib/oversight/summary";

const row = (className: string, counts: Partial<ReturnType<typeof noReports>>) => ({
  classId: className,
  className,
  classTeacherName: null,
  counts: { ...noReports(), ...counts },
  returned: 0,
});

describe("reports by status", () => {
  it("adds up every class", () => {
    const totals = reportTotals([
      row("4 Blue", { published: 30, withdrawn: 1 }),
      row("3 Green", { draft: 2, submitted: 28 }),
    ]);
    expect(totals).toEqual({ draft: 2, submitted: 28, approved: 0, published: 30, withdrawn: 1 });
    expect(totalReports(totals)).toBe(61);
  });

  it("counts a class's report rows and ignores unknown statuses", () => {
    expect(
      countReports([
        { status: "published" },
        { status: "withdrawn" },
        { status: "published" },
        { status: "other" },
      ]),
    ).toEqual({ draft: 0, submitted: 0, approved: 0, published: 2, withdrawn: 1 });
  });

  it("describes counts in words", () => {
    expect(describeReports({ ...noReports(), published: 2, withdrawn: 1 })).toBe(
      "2 published, 1 withdrawn",
    );
    expect(describeReports(noReports())).toBe("No reports yet");
  });
});

describe("search", () => {
  it("cleans the box's text", () => {
    expect(cleanSearch("  Tendai   Ncube ")).toBe("Tendai Ncube");
    expect(cleanSearch("x".repeat(150))).toHaveLength(100);
    expect(cleanSearch(undefined)).toBe("");
    expect(cleanSearch("   ")).toBe("");
  });

  it("groups results by kind and drops unknown kinds", () => {
    const grouped = groupHits([
      { kind: "learner", id: "l1", label: "Tendai Ncube", detail: "A001 · 4 Blue", roles: null },
      { kind: "staff", id: "s1", label: "Sam Moyo", detail: "sam@x", roles: ["teacher", "hod"] },
      { kind: "class", id: "c1", label: "4 Blue", detail: "2026", roles: null },
      { kind: "guardian", id: "g1", label: "x", detail: null, roles: null },
    ]);
    expect(grouped.learners.map((h) => h.label)).toEqual(["Tendai Ncube"]);
    expect(grouped.staff[0]!.roles).toEqual(["teacher", "hod"]);
    expect(grouped.classes.map((h) => h.id)).toEqual(["c1"]);
    expect(hitCount(grouped)).toBe(3);
  });

  it("opens each kind's read-only profile", () => {
    expect(hrefForHit({ kind: "learner", id: "a" })).toBe("/admin/browse/learners/a");
    expect(hrefForHit({ kind: "staff", id: "b" })).toBe("/admin/browse/staff/b");
    expect(hrefForHit({ kind: "class", id: "c" })).toBe("/admin/browse/classes/c");
  });

  it("names roles in words", () => {
    expect(rolesText(["teacher", "hod"])).toBe("Teacher, Head of department");
  });
});

describe("guardian list address", () => {
  it("defaults to never signed in and page 1", () => {
    expect(parseGuardianFilter("linked")).toBe("linked");
    expect(parseGuardianFilter("everyone")).toBe("never");
    expect(parseGuardianFilter(undefined)).toBe("never");
    expect(parsePage("3")).toBe(3);
    for (const odd of ["0", "-1", "x", "1e3", undefined, ["2"]]) expect(parsePage(odd)).toBe(1);
  });
});
