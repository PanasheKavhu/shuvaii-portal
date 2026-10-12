import { describe, expect, it } from "vitest";
import {
  SHARE_OPEN_LIMIT,
  SHARE_OPEN_WINDOW_MS,
  groupByYear,
  isShareToken,
  pickChild,
  reportFileName,
  shareLinkUrl,
  shortDate,
  whatsAppShareUrl,
  yearGroupsWithEmpty,
} from "@/lib/reports/portal";
import { limitedUntil } from "@/lib/reports/verify";

describe("groupByYear", () => {
  it("keeps the newest-first order and starts a group at each new year", () => {
    const rows = [
      { id: "a", year_label: "2026" },
      { id: "b", year_label: "2026" },
      { id: "c", year_label: "2025" },
      { id: "d", year_label: "2024" },
    ];
    expect(groupByYear(rows).map((g) => [g.year, g.reports.map((r) => r.id)])).toEqual([
      ["2026", ["a", "b"]],
      ["2025", ["c"]],
      ["2024", ["d"]],
    ]);
  });

  it("is empty with no reports", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("yearGroupsWithEmpty", () => {
  const reports = [
    { id: "a", year_label: "2026" },
    { id: "b", year_label: "2026" },
    { id: "c", year_label: "2025" },
  ];

  it("shows a new year with no reports yet first, with its class", () => {
    const years = [
      { year_label: "2027", class_name: "4 Blue" },
      { year_label: "2026", class_name: "3 Blue" },
      { year_label: "2025", class_name: "2 Blue" },
    ];
    expect(
      yearGroupsWithEmpty(reports, years).map((g) => [
        g.year,
        g.className,
        g.reports.map((r) => r.id),
      ]),
    ).toEqual([
      ["2027", "4 Blue", []],
      ["2026", "3 Blue", ["a", "b"]],
      ["2025", "2 Blue", ["c"]],
    ]);
  });

  it("keeps report years the enrolments do not list, after them", () => {
    expect(
      yearGroupsWithEmpty(reports, [{ year_label: "2026", class_name: "3 Blue" }]).map((g) => [
        g.year,
        g.className,
      ]),
    ).toEqual([
      ["2026", "3 Blue"],
      ["2025", null],
    ]);
  });

  it("is the plain grouping with no years", () => {
    expect(yearGroupsWithEmpty(reports, []).map((g) => g.year)).toEqual(["2026", "2025"]);
  });
});

describe("pickChild", () => {
  const children = [{ learner_id: "x" }, { learner_id: "y" }];

  it("takes the child asked for", () => {
    expect(pickChild(children, "y")).toEqual({ learner_id: "y" });
    expect(pickChild(children, ["y", "x"])).toEqual({ learner_id: "y" });
  });

  it("falls back to the first child for a missing or unknown id", () => {
    expect(pickChild(children, undefined)).toEqual({ learner_id: "x" });
    expect(pickChild(children, "someone-else")).toEqual({ learner_id: "x" });
  });

  it("is null with no children", () => {
    expect(pickChild([], "x")).toBeNull();
  });
});

describe("share links", () => {
  const token = "Ab3_-".padEnd(43, "x");

  it("accepts only 43-character base64url tokens", () => {
    expect(isShareToken(token)).toBe(true);
    expect(isShareToken(token.slice(1))).toBe(false);
    expect(isShareToken(`${token.slice(1)}=`)).toBe(false);
    expect(isShareToken(`${token.slice(1)}/`)).toBe(false);
  });

  it("builds the link on the portal's address", () => {
    expect(shareLinkUrl("https://portal.example/", token)).toBe(
      `https://portal.example/s/${token}`,
    );
  });

  it("fills in a WhatsApp message naming the term and school, not the learner", () => {
    const url = whatsAppShareUrl("https://portal.example/s/abc", {
      term: "Term 1 2026",
      school: "Msasa High & Co",
    });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe(
      "Term 1 2026 school report from Msasa High & Co: https://portal.example/s/abc",
    );
  });

  it("limits opens per address with a sliding window", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
    const under = Array.from({ length: SHARE_OPEN_LIMIT - 1 }, (_, i) => at(i % 9));
    expect(limitedUntil(under, now, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS)).toBeNull();
    const full = [...under, at(9)];
    expect(limitedUntil(full, now, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS)).toEqual(
      new Date(at(9).getTime() + SHARE_OPEN_WINDOW_MS),
    );
    // Opens older than the window no longer count.
    expect(
      limitedUntil([...under, at(11)], now, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS),
    ).toBeNull();
  });
});

describe("reportFileName and shortDate", () => {
  it("names the download by its reference", () => {
    expect(reportFileName("ABCDEFGH23")).toBe("report-ABCDEFGH23.pdf");
    expect(reportFileName(null)).toBe("report.pdf");
  });

  it("writes a short date in Harare time", () => {
    expect(shortDate("2026-10-17T23:30:00Z")).toBe("18 Oct");
    expect(shortDate("not a date")).toBe("");
  });
});
