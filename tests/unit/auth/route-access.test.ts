import { describe, expect, it } from "vitest";
import type { SchoolMembership } from "@/lib/auth/active-school";
import { areaForPath, decideAreaAccess } from "@/lib/auth/route-access";
import { NO_BRANDING } from "@/lib/branding/theme";
import { DEFAULT_FEATURES } from "@/lib/platform/features";

const school = (
  id: string,
  roles: SchoolMembership["roles"],
  features = DEFAULT_FEATURES,
): SchoolMembership => ({
  schoolId: id,
  schoolName: id,
  roles,
  branding: NO_BRANDING,
  features,
});

describe("areaForPath", () => {
  it("maps area roots and sub-pages", () => {
    expect(areaForPath("/admin")).toBe("admin");
    expect(areaForPath("/admin/users")).toBe("admin");
    expect(areaForPath("/my-reports")).toBe("myReports");
  });

  it("picks the most specific area", () => {
    expect(areaForPath("/admin/audit")).toBe("audit");
    expect(areaForPath("/admin/audit/x")).toBe("audit");
    expect(areaForPath("/admin/auditx")).toBe("admin");
    expect(areaForPath("/admin/newsletter/new")).toBe("newsletter");
    expect(areaForPath("/news/abc")).toBe("news");
    expect(areaForPath("/marks/completion")).toBe("completion");
    expect(areaForPath("/marks/abc")).toBe("marks");
  });

  it("lets a head into the overview and audit log but not setup, people, exports or rollover", () => {
    const head = {
      isPlatformAdmin: false,
      schools: [school("a", ["head"])],
      assurance: "aal2" as const,
    };
    for (const path of ["/admin", "/admin/browse/learners/x", "/admin/audit"])
      expect(decideAreaAccess(areaForPath(path)!, head, undefined)).toMatchObject({
        kind: "allow",
      });
    for (const path of [
      "/admin/setup",
      "/admin/setup/x",
      "/admin/people/learners",
      "/admin/exports",
      "/admin/exports/download",
      "/admin/rollover",
    ])
      expect(decideAreaAccess(areaForPath(path)!, head, undefined)).toEqual({
        kind: "forbidden",
      });
  });

  it("keeps teachers out of the overview and browse pages", () => {
    const teacher = { isPlatformAdmin: false, schools: [school("a", ["teacher"])] };
    for (const path of ["/admin", "/admin/browse/learners/x"])
      expect(decideAreaAccess(areaForPath(path)!, teacher, undefined)).toEqual({
        kind: "forbidden",
      });
  });

  it("closes the newsletter areas of a school that switched the newsletter off (D55)", () => {
    const off = { ...DEFAULT_FEATURES, newsletter: false };
    const admin = {
      isPlatformAdmin: false,
      schools: [school("a", ["school_admin"], off)],
      assurance: "aal2" as const,
    };
    const parent = { isPlatformAdmin: false, schools: [school("a", ["parent"], off)] };
    for (const path of ["/admin/newsletter", "/admin/newsletter/new", "/news", "/news/x"]) {
      expect(decideAreaAccess(areaForPath(path)!, admin, undefined)).toEqual({ kind: "forbidden" });
      expect(decideAreaAccess(areaForPath(path)!, parent, undefined)).toEqual({
        kind: "forbidden",
      });
    }
    expect(decideAreaAccess("admin", admin, undefined)).toMatchObject({ kind: "allow" });
    expect(decideAreaAccess("children", parent, undefined)).toMatchObject({ kind: "allow" });
  });

  it("judges each school by its own switches", () => {
    const off = { ...DEFAULT_FEATURES, newsletter: false };
    const viewer = {
      isPlatformAdmin: false,
      schools: [school("a", ["teacher"], off), school("b", ["teacher"])],
    };
    expect(decideAreaAccess("news", viewer, "a")).toEqual({ kind: "forbidden" });
    expect(decideAreaAccess("news", viewer, "b")).toMatchObject({ kind: "allow" });
  });

  it("ignores other pages and look-alike prefixes", () => {
    expect(areaForPath("/")).toBeNull();
    expect(areaForPath("/sign-in")).toBeNull();
    expect(areaForPath("/administrator")).toBeNull();
  });
});

describe("decideAreaAccess", () => {
  const teacher = { isPlatformAdmin: false, schools: [school("a", ["teacher"])] };

  it("sends signed-out visitors to sign in", () => {
    expect(decideAreaAccess("admin", null, undefined)).toEqual({ kind: "sign-in" });
  });

  it("allows a role into its own area", () => {
    expect(decideAreaAccess("teaching", teacher, undefined)).toMatchObject({ kind: "allow" });
  });

  it("forbids every other role area and the platform console", () => {
    const others = [
      "admin",
      "audit",
      "head",
      "department",
      "children",
      "myReports",
      "platform",
    ] as const;
    for (const key of others) {
      expect(decideAreaAccess(key, teacher, undefined), key).toEqual({ kind: "forbidden" });
    }
  });

  it("uses the roles of the chosen school only", () => {
    const viewer = {
      isPlatformAdmin: false,
      schools: [school("a", ["teacher"]), school("b", ["school_admin"])],
      assurance: "aal2" as const,
    };
    expect(decideAreaAccess("admin", viewer, undefined)).toEqual({ kind: "choose-school" });
    expect(decideAreaAccess("admin", viewer, "a")).toEqual({ kind: "forbidden" });
    expect(decideAreaAccess("admin", viewer, "b")).toMatchObject({ kind: "allow" });
  });

  it("lets only platform admins into the platform console", () => {
    const platformAdmin = { isPlatformAdmin: true, schools: [], assurance: "aal2" as const };
    expect(decideAreaAccess("platform", platformAdmin, undefined)).toMatchObject({
      kind: "allow",
    });
    expect(decideAreaAccess("admin", platformAdmin, undefined)).toEqual({ kind: "forbidden" });
  });

  describe("two-factor sign in (D54)", () => {
    const admin = (assurance?: "aal1" | "aal2") => ({
      isPlatformAdmin: false,
      schools: [school("a", ["school_admin", "teacher"])],
      assurance,
    });

    it("sends a school admin, head or super admin without the second step to it, for every area", () => {
      for (const key of ["admin", "teaching", "news", "marks"] as const)
        expect(decideAreaAccess(key, admin("aal1"), undefined), key).toEqual({
          kind: "two-factor",
        });
      const head = {
        isPlatformAdmin: false,
        schools: [school("a", ["head"])],
        assurance: "aal1" as const,
      };
      expect(decideAreaAccess("head", head, undefined)).toEqual({ kind: "two-factor" });
      const platform = { isPlatformAdmin: true, schools: [], assurance: "aal1" as const };
      expect(decideAreaAccess("platform", platform, undefined)).toEqual({ kind: "two-factor" });
    });

    it("treats an unknown assurance level as not passed", () => {
      expect(decideAreaAccess("admin", admin(), undefined)).toEqual({ kind: "two-factor" });
    });

    it("lets them in at aal2", () => {
      expect(decideAreaAccess("admin", admin("aal2"), undefined)).toMatchObject({ kind: "allow" });
    });

    it("never asks a teacher, parent or learner", () => {
      for (const roles of [["teacher"], ["hod"], ["parent"], ["learner"]] as const) {
        const viewer = {
          isPlatformAdmin: false,
          schools: [school("a", [...roles])],
          assurance: "aal1" as const,
        };
        expect(decideAreaAccess("news", viewer, undefined)).toMatchObject({ kind: "allow" });
      }
    });

    it("asks a teacher who is a head in another school", () => {
      const viewer = {
        isPlatformAdmin: false,
        schools: [school("a", ["teacher"]), school("b", ["head"])],
        assurance: "aal1" as const,
      };
      expect(decideAreaAccess("teaching", viewer, "a")).toEqual({ kind: "two-factor" });
    });
  });
});
