import { describe, expect, it } from "vitest";
import { parseParentSignUp } from "@/lib/auth/parent-sign-up";

describe("parseParentSignUp", () => {
  it("normalises the name and email", () => {
    expect(
      parseParentSignUp({
        fullName: "  Gwen   Dube ",
        email: " Gwen@Example.co.zw ",
        password: "a-long-password",
        confirm: "a-long-password",
      }),
    ).toEqual({
      ok: true,
      value: { fullName: "Gwen Dube", email: "gwen@example.co.zw", password: "a-long-password" },
    });
  });

  it("reports every field that is wrong", () => {
    expect(
      parseParentSignUp({ fullName: "", email: "nope", password: "short", confirm: "short" }),
    ).toEqual({
      ok: false,
      errors: {
        fullName: "Enter your full name.",
        email: "Enter a valid email address.",
        password: "Use at least 8 characters.",
      },
    });
  });

  it("needs the two passwords to match", () => {
    expect(
      parseParentSignUp({
        fullName: "Gwen Dube",
        email: "gwen@example.co.zw",
        password: "a-long-password",
        confirm: "a-long-passwork",
      }),
    ).toEqual({ ok: false, errors: { password: "The two passwords do not match." } });
  });
});
