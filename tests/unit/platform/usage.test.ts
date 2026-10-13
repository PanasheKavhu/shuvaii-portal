import { describe, expect, it } from "vitest";
import {
  ONBOARDING_ITEMS,
  ago,
  byLastActivity,
  formatBytes,
  isQuiet,
  onboardingItems,
  totalBytes,
  type SchoolUsage,
} from "@/lib/platform/usage";

const now = new Date("2026-10-13T10:00:00Z");
const usage = (id: string, lastActivityAt: string | null): SchoolUsage => ({
  schoolId: id,
  activeLearners: 1,
  activeStaff: 1,
  activeParents: 1,
  bytes: { reports: 1000, attachments: 200, imports: 30, branding: 12 },
  publishedReports: 0,
  lastSignInAt: lastActivityAt,
  lastMarksAt: null,
  lastActivityAt,
});

describe("formatBytes", () => {
  it("reads like a person would say it", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(980)).toBe("980 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });

  it("adds the four buckets", () => {
    expect(totalBytes(usage("a", null))).toBe(1242);
  });
});

describe("last activity", () => {
  it("says when, in days", () => {
    expect(ago(null, now)).toBe("Never");
    expect(ago("2026-10-13T08:00:00Z", now)).toBe("Today");
    expect(ago("2026-10-12T08:00:00Z", now)).toBe("Yesterday");
    expect(ago("2026-10-01T08:00:00Z", now)).toBe("12 days ago");
  });

  it("marks a school quiet after 14 days, or when it was never active", () => {
    expect(isQuiet(null, now)).toBe(true);
    expect(isQuiet("2026-09-29T09:00:00Z", now)).toBe(true);
    expect(isQuiet("2026-09-30T11:00:00Z", now)).toBe(false);
  });

  it("sorts quietest first", () => {
    const list = [
      usage("busy", "2026-10-12T08:00:00Z"),
      usage("never", null),
      usage("quiet", "2026-09-01T08:00:00Z"),
    ];
    expect(list.sort(byLastActivity).map((u) => u.schoolId)).toEqual(["never", "quiet", "busy"]);
  });
});

describe("onboardingItems", () => {
  it("lists all eight items in order, missing rows as not done", () => {
    const items = onboardingItems([
      { item: "branding", done: true, missing: null },
      { item: "class_teachers", done: false, missing: 2 },
      { item: "grading_scales", done: false, missing: 1 },
      { item: "something_else", done: true, missing: null },
    ]);
    expect(items.map((i) => i.key)).toEqual(Object.keys(ONBOARDING_ITEMS));
    expect(items.find((i) => i.key === "branding")?.done).toBe(true);
    expect(items.find((i) => i.key === "privacy_contact")?.done).toBe(false);
    expect(items.find((i) => i.key === "class_teachers")?.missing).toBe(
      "2 classes without a class teacher.",
    );
    expect(items.find((i) => i.key === "grading_scales")?.missing).toBe(
      "1 grade level still needs a complete scale.",
    );
  });
});
