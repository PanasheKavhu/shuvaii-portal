import { describe, expect, it } from "vitest";
import {
  describeLock,
  describeUnlockers,
  formatDate,
  marksProgress,
  pickCurrentTerm,
  todayIn,
} from "@/lib/marks/terms";

const terms = [
  { id: "t1", kind: "term", startsOn: "2026-01-13", endsOn: "2026-04-09" },
  { id: "v", kind: "vacation", startsOn: "2026-04-09", endsOn: "2026-04-24" },
  { id: "t2", kind: "term", startsOn: "2026-05-05", endsOn: "2026-08-07" },
  { id: "t3", kind: "term", startsOn: "2026-09-08", endsOn: "2026-12-04" },
];

describe("pickCurrentTerm", () => {
  it("picks the term that includes today, preferring a term to a vacation", () => {
    expect(pickCurrentTerm(terms, "2026-10-09")?.id).toBe("t3");
    expect(pickCurrentTerm(terms, "2026-04-09")?.id).toBe("t1");
    expect(pickCurrentTerm(terms, "2026-04-15")?.id).toBe("v");
  });

  it("between terms picks the latest that has started, before the year the first", () => {
    expect(pickCurrentTerm(terms, "2026-08-20")?.id).toBe("t2");
    expect(pickCurrentTerm(terms, "2026-01-01")?.id).toBe("t1");
    expect(pickCurrentTerm([], "2026-01-01")).toBeNull();
  });
});

describe("todayIn", () => {
  it("uses the school's time zone", () => {
    // 23:30 UTC on 9 October is 01:30 on 10 October in Harare.
    expect(todayIn("Africa/Harare", new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-10");
    expect(todayIn("Not/AZone", new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-09");
  });
});

describe("marksProgress", () => {
  it("counts marks against learners x assessments", () => {
    expect(marksProgress({ learners: 10, assessments: 3, marksEntered: 20 })).toEqual({
      entered: 20,
      expected: 30,
      percent: 66,
    });
    expect(marksProgress({ learners: 10, assessments: 0, marksEntered: 0 }).percent).toBe(0);
  });
});

describe("lock text", () => {
  it("says why and who to ask", () => {
    expect(describeLock("term_closed", null)).toBe("the term is closed");
    expect(describeLock("deadline_passed", "2026-11-20")).toBe(
      "the marks deadline (20 Nov 2026) has passed",
    );
    expect(
      describeUnlockers([
        { name: "Grace Tembo", role: "school_admin" },
        { name: "Patrick Zimunya", role: "head" },
      ]),
    ).toBe("Grace Tembo (school admin) or Patrick Zimunya (head)");
    expect(describeUnlockers([])).toBe("your school admin or head");
    expect(formatDate("2026-03-27")).toBe("27 Mar 2026");
  });
});
