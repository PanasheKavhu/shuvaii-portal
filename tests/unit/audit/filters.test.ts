import { describe, expect, it } from "vitest";
import {
  auditQuery,
  decodeCursor,
  encodeCursor,
  hasFilters,
  parseAuditFilters,
} from "@/lib/audit/filters";

const ID = "9341cf1e-f77b-5e4a-abbe-6a72f8c4a2fa";

describe("parseAuditFilters", () => {
  it("keeps well-formed filters", () => {
    expect(
      parseAuditFilters({
        learner: ID,
        class: ID,
        actor: ID,
        from: "2026-10-01",
        to: "2026-10-09",
        q: "  Tendai ",
      }),
    ).toEqual({
      learnerId: ID,
      learnerQuery: "Tendai",
      classId: ID,
      actorId: ID,
      from: "2026-10-01",
      to: "2026-10-09",
    });
  });

  it("drops anything malformed", () => {
    const f = parseAuditFilters({
      learner: "not-a-uuid",
      class: ["a", "b"],
      actor: "'; drop table",
      from: "2026-02-30",
      to: "yesterday",
    });
    expect(f).toEqual({
      learnerId: null,
      learnerQuery: "",
      classId: null,
      actorId: null,
      from: null,
      to: null,
    });
    expect(hasFilters(f)).toBe(false);
  });
});

describe("cursor", () => {
  it("round-trips the database timestamp exactly, microseconds included", () => {
    const c = { id: 42, createdAt: "2026-10-09T14:00:00.123456+00:00" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("refuses a cursor that is not ours", () => {
    for (const bad of ["", "42", "~2026-10-09T14:00:00Z", "x~2026-10-09T14:00:00Z", "1~now()"])
      expect(decodeCursor(bad), bad).toBeNull();
  });
});

describe("auditQuery", () => {
  it("keeps the filters on the next-page link", () => {
    const f = parseAuditFilters({ class: ID, from: "2026-10-01" });
    expect(auditQuery(f, { id: 7, createdAt: "2026-10-09T14:00:00Z" })).toBe(
      `?class=${ID}&from=2026-10-01&before=7%7E2026-10-09T14%3A00%3A00Z`,
    );
    expect(auditQuery(parseAuditFilters({}))).toBe("");
  });
});
