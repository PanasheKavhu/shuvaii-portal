import { describe, expect, it } from "vitest";
import {
  expiresAtForDate,
  isDate,
  isExpired,
  isLive,
  lastDayShown,
  sortNews,
} from "@/lib/news/visibility";

const now = new Date("2026-10-12T10:00:00Z");

describe("isLive and isExpired", () => {
  it("shows a published post with no expiry or a later one", () => {
    expect(isLive({ status: "published", expiresAt: null }, now)).toBe(true);
    expect(isLive({ status: "published", expiresAt: "2026-10-12T10:00:01Z" }, now)).toBe(true);
  });
  it("hides it from the moment it expires", () => {
    const at = { status: "published" as const, expiresAt: "2026-10-12T10:00:00Z" };
    expect(isLive(at, now)).toBe(false);
    expect(isExpired(at, now)).toBe(true);
  });
  it("never shows drafts or archived posts, and does not call them expired", () => {
    for (const status of ["draft", "archived"] as const) {
      expect(isLive({ status, expiresAt: null }, now)).toBe(false);
      expect(isExpired({ status, expiresAt: "2026-01-01T00:00:00Z" }, now)).toBe(false);
    }
  });
});

describe("sortNews", () => {
  const item = (id: string, publishedAt: string | null, pinned = false, live = true) => ({
    id,
    publishedAt,
    pinned,
    live,
  });

  it("puts pinned live posts first, then newest first", () => {
    const sorted = sortNews([
      item("old", "2026-10-01T08:00:00Z"),
      item("new", "2026-10-10T08:00:00Z"),
      item("pinned-old", "2026-09-01T08:00:00Z", true),
      item("mid", "2026-10-05T08:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["pinned-old", "new", "mid", "old"]);
  });

  it("does not lift a pinned post that is no longer live", () => {
    const sorted = sortNews([
      item("expired-pinned", "2026-09-01T08:00:00Z", true, false),
      item("new", "2026-10-10T08:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["new", "expired-pinned"]);
  });

  it("orders drafts by when they were written, and equal dates by id", () => {
    const sorted = sortNews([
      { id: "b", publishedAt: null, createdAt: "2026-10-03T00:00:00Z", pinned: false, live: false },
      { id: "a", publishedAt: "2026-10-03T00:00:00Z", pinned: false, live: true },
      { id: "c", publishedAt: "2026-10-04T00:00:00Z", pinned: false, live: true },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("expiry dates", () => {
  it("shows a post until midnight at the end of the chosen day in Harare (UTC+2)", () => {
    expect(expiresAtForDate("2026-10-20", "Africa/Harare")).toBe("2026-10-20T22:00:00.000Z");
    expect(lastDayShown("2026-10-20T22:00:00.000Z", "Africa/Harare")).toBe("2026-10-20");
  });

  it("crosses months and years, and works in a zone with summer time", () => {
    expect(expiresAtForDate("2026-12-31", "Africa/Harare")).toBe("2026-12-31T22:00:00.000Z");
    // London is on summer time (UTC+1) on 1 August.
    expect(expiresAtForDate("2026-07-31", "Europe/London")).toBe("2026-07-31T23:00:00.000Z");
    expect(lastDayShown("2026-07-31T23:00:00.000Z", "Europe/London")).toBe("2026-07-31");
  });

  it("knows a real date", () => {
    expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("20-10-2026")).toBe(false);
    expect(isDate("")).toBe(false);
  });
});
