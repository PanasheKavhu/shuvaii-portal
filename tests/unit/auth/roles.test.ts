import { describe, expect, it } from "vitest";
import { canUseArea, AREAS, homeFor, navFor } from "@/lib/auth/roles";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navFor", () => {
  it("shows a teacher their classes and the news", () => {
    expect(hrefs(navFor(["teacher"], false))).toEqual(["/teaching", "/marks/completion", "/news"]);
  });

  it("shows a school admin and head their area, marks, completion, the audit log and the newsletter", () => {
    const shared = ["/marks", "/marks/completion", "/admin/audit", "/admin/newsletter"];
    expect(hrefs(navFor(["school_admin"], false))).toEqual(["/admin", ...shared]);
    expect(hrefs(navFor(["head"], false))).toEqual(["/admin", "/head", ...shared]);
  });

  it("shows a head of department their department and classes, without a marks entry", () => {
    expect(hrefs(navFor(["hod"], false))).toEqual([
      "/department",
      "/teaching",
      "/marks/completion",
      "/news",
    ]);
  });

  it("combines areas for someone with two roles", () => {
    expect(hrefs(navFor(["parent", "teacher"], false))).toEqual([
      "/teaching",
      "/marks/completion",
      "/children",
      "/news",
    ]);
  });

  it("gives parents and learners the news after their reports", () => {
    expect(hrefs(navFor(["parent"], false))).toEqual(["/children", "/news"]);
    expect(hrefs(navFor(["learner"], false))).toEqual(["/my-reports", "/news"]);
  });

  it("shows the platform console only to platform admins", () => {
    expect(hrefs(navFor([], true))).toEqual(["/platform"]);
    expect(hrefs(navFor(["head"], false))).not.toContain("/platform");
  });

  it("shows nothing to someone with no roles", () => {
    expect(navFor([], false)).toEqual([]);
  });
});

describe("homeFor", () => {
  it("sends each role to its own home", () => {
    expect(homeFor(["school_admin"], false)).toBe("/admin");
    // The overview is the head's home too (US-9.1, D51).
    expect(homeFor(["head"], false)).toBe("/admin");
    expect(homeFor(["hod"], false)).toBe("/department");
    expect(homeFor(["teacher"], false)).toBe("/teaching");
    expect(homeFor(["parent"], false)).toBe("/children");
    expect(homeFor(["learner"], false)).toBe("/my-reports");
  });

  it("prefers the staff area for a teacher who is also a parent", () => {
    expect(homeFor(["parent", "teacher"], false)).toBe("/teaching");
  });

  it("sends a platform admin with no school to the platform console", () => {
    expect(homeFor([], true)).toBe("/platform");
  });

  it("returns null when there is nowhere to go", () => {
    expect(homeFor([], false)).toBeNull();
  });
});

describe("canUseArea", () => {
  it("denies a teacher the admin and head areas", () => {
    expect(canUseArea(AREAS.admin, ["teacher"], false)).toBe(false);
    expect(canUseArea(AREAS.head, ["teacher"], false)).toBe(false);
  });

  it("opens the overview to school admin, head and hod, and setup and people to the school admin only", () => {
    for (const role of ["school_admin", "head", "hod"] as const)
      expect(canUseArea(AREAS.admin, [role], false)).toBe(true);
    for (const role of ["teacher", "parent", "learner"] as const)
      expect(canUseArea(AREAS.admin, [role], false)).toBe(false);
    for (const area of [AREAS.setup, AREAS.people]) {
      expect(canUseArea(area, ["school_admin"], false)).toBe(true);
      for (const role of ["head", "hod", "teacher"] as const)
        expect(canUseArea(area, [role], false)).toBe(false);
    }
  });

  it("lets teaching staff, admin and head use the marks screens, but not parents or learners", () => {
    for (const role of ["teacher", "hod", "school_admin", "head"] as const)
      expect(canUseArea(AREAS.marks, [role], false)).toBe(true);
    expect(canUseArea(AREAS.marks, ["parent"], false)).toBe(false);
    expect(canUseArea(AREAS.marks, ["learner"], false)).toBe(false);
    expect(canUseArea(AREAS.teaching, ["school_admin"], false)).toBe(false);
  });

  it("lets only school admin and head use the audit log", () => {
    expect(canUseArea(AREAS.audit, ["school_admin"], false)).toBe(true);
    expect(canUseArea(AREAS.audit, ["head"], false)).toBe(true);
    for (const role of ["teacher", "hod", "parent", "learner"] as const)
      expect(canUseArea(AREAS.audit, [role], false)).toBe(false);
  });

  it("denies a school admin the platform console", () => {
    expect(canUseArea(AREAS.platform, ["school_admin"], false)).toBe(false);
  });
});
