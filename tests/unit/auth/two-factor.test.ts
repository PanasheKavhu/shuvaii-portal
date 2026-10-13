import { describe, expect, it } from "vitest";
import {
  assuranceOf,
  formatSetupKey,
  needsTwoFactor,
  parseTotpCode,
  secondStepPending,
} from "@/lib/auth/two-factor";

const viewer = (roles: string[][], isPlatformAdmin = false) => ({
  isPlatformAdmin,
  schools: roles.map((r) => ({ roles: r as never })),
});

describe("needsTwoFactor", () => {
  it("is required for super admins, school admins and heads", () => {
    expect(needsTwoFactor(viewer([], true))).toBe(true);
    expect(needsTwoFactor(viewer([["school_admin"]]))).toBe(true);
    expect(needsTwoFactor(viewer([["head"]]))).toBe(true);
  });

  it("is never asked of teachers, hods, parents or learners", () => {
    for (const role of ["teacher", "hod", "parent", "learner"]) {
      expect(needsTwoFactor(viewer([[role]])), role).toBe(false);
    }
  });

  it("counts a head role in any of the person's schools", () => {
    expect(needsTwoFactor(viewer([["teacher"], ["head"]]))).toBe(true);
  });
});

describe("secondStepPending", () => {
  it("is pending until the session is aal2", () => {
    expect(secondStepPending({ ...viewer([["head"]]), assurance: "aal1" })).toBe(true);
    expect(secondStepPending({ ...viewer([["head"]]), assurance: null })).toBe(true);
    expect(secondStepPending({ ...viewer([["head"]]), assurance: "aal2" })).toBe(false);
    expect(secondStepPending({ ...viewer([["teacher"]]), assurance: "aal1" })).toBe(false);
  });
});

describe("parseTotpCode", () => {
  it("accepts 6 digits, ignoring spaces and dashes", () => {
    expect(parseTotpCode(" 123 456 ")).toEqual({ ok: true, value: "123456" });
    expect(parseTotpCode("123-456")).toEqual({ ok: true, value: "123456" });
  });

  it("refuses anything else", () => {
    expect(parseTotpCode("")).toMatchObject({ ok: false });
    expect(parseTotpCode(null)).toMatchObject({ ok: false });
    expect(parseTotpCode("12345")).toEqual({ ok: false, error: "The code is 6 digits." });
    expect(parseTotpCode("1234567")).toMatchObject({ ok: false });
    expect(parseTotpCode("12345a")).toMatchObject({ ok: false });
  });
});

describe("formatSetupKey", () => {
  it("groups the key in fours", () => {
    expect(formatSetupKey("JBSWY3DPEHPK3PXPJBSW")).toBe("JBSW Y3DP EHPK 3PXP JBSW");
  });
});

describe("assuranceOf", () => {
  const token = (claims: object) =>
    `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

  it("reads the aal claim", () => {
    expect(assuranceOf(token({ aal: "aal1" }))).toBe("aal1");
    expect(assuranceOf(token({ aal: "aal2" }))).toBe("aal2");
  });

  it("is null for a missing, unknown or broken token", () => {
    expect(assuranceOf(undefined)).toBeNull();
    expect(assuranceOf(token({ aal: "aal3" }))).toBeNull();
    expect(assuranceOf("not-a-token")).toBeNull();
    expect(assuranceOf("a.%%%.b")).toBeNull();
  });
});
