import { describe, expect, it } from "vitest";
import { parseNewPassword } from "@/lib/auth/new-password";

describe("parseNewPassword", () => {
  it("accepts a long enough matching password", () => {
    expect(parseNewPassword({ password: "harare-2026", confirm: "harare-2026" })).toEqual({
      ok: true,
      value: "harare-2026",
    });
  });

  it("rejects short, overlong and mismatched passwords", () => {
    expect(parseNewPassword({ password: "short", confirm: "short" })).toMatchObject({ ok: false });
    expect(parseNewPassword({ password: "x".repeat(73), confirm: "x".repeat(73) })).toMatchObject({
      ok: false,
    });
    expect(parseNewPassword({ password: "harare-2026", confirm: "harare-2027" })).toEqual({
      ok: false,
      error: "The two passwords do not match.",
    });
    expect(parseNewPassword({ password: null, confirm: null })).toMatchObject({ ok: false });
  });
});
