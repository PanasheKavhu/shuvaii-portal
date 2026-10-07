import { describe, expect, it } from "vitest";
import { parseSignIn } from "@/lib/auth/sign-in-input";

describe("parseSignIn", () => {
  it("trims and lower-cases the email", () => {
    expect(parseSignIn({ email: "  RChik@Msasa.Demo.SPPortal.test ", password: "pw" })).toEqual({
      ok: true,
      value: { email: "rchik@msasa.demo.spportal.test", password: "pw" },
    });
  });

  it("asks for both fields", () => {
    expect(parseSignIn({ email: "", password: "pw" })).toMatchObject({ ok: false });
    expect(parseSignIn({ email: "a@b.test", password: "" })).toMatchObject({ ok: false });
    expect(parseSignIn({ email: null, password: undefined })).toMatchObject({ ok: false });
  });

  it("rejects an address without a domain", () => {
    expect(parseSignIn({ email: "teacher", password: "pw" })).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
  });

  it("rejects absurdly long passwords without saying why", () => {
    expect(parseSignIn({ email: "a@b.test", password: "x".repeat(201) })).toEqual({
      ok: false,
      error: "Email or password is incorrect.",
    });
  });
});
