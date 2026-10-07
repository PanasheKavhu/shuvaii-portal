import { describe, expect, it } from "vitest";
import { isResetSession, parseResetCode, parseResetEmail } from "@/lib/auth/password-reset";

describe("parseResetEmail", () => {
  it("normalises a valid address", () => {
    expect(parseResetEmail({ email: "  PZimu@Msasa.demo.spportal.test " })).toEqual({
      ok: true,
      value: "pzimu@msasa.demo.spportal.test",
    });
  });

  it("rejects missing and malformed addresses", () => {
    expect(parseResetEmail({ email: "" })).toEqual({
      ok: false,
      error: "Enter your email address.",
    });
    expect(parseResetEmail({ email: null })).toMatchObject({ ok: false });
    expect(parseResetEmail({ email: "not-an-email" })).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
    expect(parseResetEmail({ email: `${"a".repeat(250)}@x.zw` })).toMatchObject({ ok: false });
  });
});

describe("parseResetCode", () => {
  it("accepts six digits, ignoring spaces", () => {
    expect(parseResetCode({ email: "a@b.zw", code: " 123 456 " })).toEqual({
      ok: true,
      value: { email: "a@b.zw", code: "123456" },
    });
  });

  it("rejects short, long and non-numeric codes", () => {
    const error = "Enter the 6-digit code from the email.";
    for (const code of ["12345", "1234567", "12345a", "", null]) {
      expect(parseResetCode({ email: "a@b.zw", code })).toEqual({ ok: false, error });
    }
  });

  it("checks the email first", () => {
    expect(parseResetCode({ email: "bad", code: "123456" })).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
  });
});

describe("isResetSession", () => {
  it("is true only when the cookie names the current session", () => {
    expect(isResetSession("s-1", "s-1")).toBe(true);
    expect(isResetSession("s-1", "s-2")).toBe(false);
    expect(isResetSession(undefined, "s-1")).toBe(false);
    expect(isResetSession("", "")).toBe(false);
    expect(isResetSession("s-1", undefined)).toBe(false);
  });
});
