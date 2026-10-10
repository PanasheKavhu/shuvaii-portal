import { describe, expect, it } from "vitest";
import type { SchoolMembership } from "@/lib/auth/active-school";
import { areaForPath, decideAreaAccess } from "@/lib/auth/route-access";
import { NO_BRANDING } from "@/lib/branding/theme";

const school = (id: string, roles: SchoolMembership["roles"]): SchoolMembership => ({
  schoolId: id,
  schoolName: id,
  roles,
  branding: NO_BRANDING,
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
    expect(areaForPath("/marks/completion")).toBe("completion");
    expect(areaForPath("/marks/abc")).toBe("marks");
  });

  it("lets a head into the audit log but not the rest of /admin", () => {
    const head = { isPlatformAdmin: false, schools: [school("a", ["head"])] };
    expect(decideAreaAccess(areaForPath("/admin/audit")!, head, undefined)).toMatchObject({
      kind: "allow",
    });
    expect(decideAreaAccess(areaForPath("/admin/setup")!, head, undefined)).toEqual({
      kind: "forbidden",
    });
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
    };
    expect(decideAreaAccess("admin", viewer, undefined)).toEqual({ kind: "choose-school" });
    expect(decideAreaAccess("admin", viewer, "a")).toEqual({ kind: "forbidden" });
    expect(decideAreaAccess("admin", viewer, "b")).toMatchObject({ kind: "allow" });
  });

  it("lets only platform admins into the platform console", () => {
    const platformAdmin = { isPlatformAdmin: true, schools: [] };
    expect(decideAreaAccess("platform", platformAdmin, undefined)).toMatchObject({
      kind: "allow",
    });
    expect(decideAreaAccess("admin", platformAdmin, undefined)).toEqual({ kind: "forbidden" });
  });
});
