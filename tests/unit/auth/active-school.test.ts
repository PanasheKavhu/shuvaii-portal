import { describe, expect, it } from "vitest";
import { groupMemberships, pickActiveSchool } from "@/lib/auth/active-school";

const msasa = { schoolId: "s-msasa", schoolName: "Msasa", roles: ["teacher" as const] };
const kudzai = { schoolId: "s-kudzai", schoolName: "Kudzai", roles: ["teacher" as const] };

describe("pickActiveSchool", () => {
  it("uses the only school without a cookie", () => {
    expect(pickActiveSchool([msasa], undefined)).toBe(msasa);
  });

  it("asks a multi-school user to choose when there is no cookie", () => {
    expect(pickActiveSchool([msasa, kudzai], undefined)).toBeNull();
  });

  it("uses the chosen school", () => {
    expect(pickActiveSchool([msasa, kudzai], "s-kudzai")).toBe(kudzai);
  });

  it("ignores a cookie naming a school the user does not belong to", () => {
    expect(pickActiveSchool([msasa, kudzai], "s-other")).toBeNull();
    expect(pickActiveSchool([msasa], "s-other")).toBe(msasa);
  });

  it("returns null for a user with no schools", () => {
    expect(pickActiveSchool([], "s-msasa")).toBeNull();
  });
});

describe("groupMemberships", () => {
  it("groups roles per school and sorts by name", () => {
    expect(
      groupMemberships([
        { schoolId: "s-msasa", schoolName: "Msasa", role: "teacher" },
        { schoolId: "s-kudzai", schoolName: "Kudzai", role: "teacher" },
        { schoolId: "s-msasa", schoolName: "Msasa", role: "parent" },
        { schoolId: "s-msasa", schoolName: "Msasa", role: "parent" },
      ]),
    ).toEqual([
      { schoolId: "s-kudzai", schoolName: "Kudzai", roles: ["teacher"] },
      { schoolId: "s-msasa", schoolName: "Msasa", roles: ["teacher", "parent"] },
    ]);
  });
});
