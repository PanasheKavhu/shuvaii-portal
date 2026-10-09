import { describe, expect, it } from "vitest";
import { canUseArea, AREAS, homeFor, navFor } from "@/lib/auth/roles";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navFor", () => {
  it("shows a teacher only their classes", () => {
    expect(hrefs(navFor(["teacher"], false))).toEqual(["/teaching"]);
  });

  it("shows a school admin the admin area and marks", () => {
    expect(hrefs(navFor(["school_admin"], false))).toEqual(["/admin", "/marks"]);
    expect(hrefs(navFor(["head"], false))).toEqual(["/head", "/marks"]);
  });

  it("shows a head of department their department and classes, without a marks entry", () => {
    expect(hrefs(navFor(["hod"], false))).toEqual(["/department", "/teaching"]);
  });

  it("combines areas for someone with two roles", () => {
    expect(hrefs(navFor(["parent", "teacher"], false))).toEqual(["/teaching", "/children"]);
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
    expect(homeFor(["head"], false)).toBe("/head");
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

  it("lets teaching staff, admin and head use the marks screens, but not parents or learners", () => {
    for (const role of ["teacher", "hod", "school_admin", "head"] as const)
      expect(canUseArea(AREAS.marks, [role], false)).toBe(true);
    expect(canUseArea(AREAS.marks, ["parent"], false)).toBe(false);
    expect(canUseArea(AREAS.marks, ["learner"], false)).toBe(false);
    expect(canUseArea(AREAS.teaching, ["school_admin"], false)).toBe(false);
  });

  it("denies a school admin the platform console", () => {
    expect(canUseArea(AREAS.platform, ["school_admin"], false)).toBe(false);
  });
});
