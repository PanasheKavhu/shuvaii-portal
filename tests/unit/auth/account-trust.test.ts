import { describe, expect, it } from "vitest";
import {
  EMAIL_UNVERIFIED,
  signedInWithPassword,
  hasProvedEmail,
  matchesEmailOnFile,
} from "@/lib/auth/account-trust";

describe("hasProvedEmail", () => {
  const confirmed = "2026-10-08T10:00:00Z";

  it("trusts a confirmed account", () => {
    expect(hasProvedEmail({ email_confirmed_at: confirmed, app_metadata: {} })).toBe(true);
  });

  it("does not trust an account that never confirmed", () => {
    expect(hasProvedEmail({ email_confirmed_at: null, app_metadata: {} })).toBe(false);
  });

  it("does not trust a parent account flagged as unproved", () => {
    expect(
      hasProvedEmail({ email_confirmed_at: confirmed, app_metadata: { [EMAIL_UNVERIFIED]: true } }),
    ).toBe(false);
  });

  it("trusts it again once a reset cleared the flag", () => {
    expect(
      hasProvedEmail({ email_confirmed_at: confirmed, app_metadata: { [EMAIL_UNVERIFIED]: null } }),
    ).toBe(true);
  });
});

describe("matchesEmailOnFile", () => {
  it("ignores case and spaces", () => {
    expect(matchesEmailOnFile(" Rudo@Example.com ", "rudo@example.com")).toBe(true);
  });

  it("refuses a different address or none on file", () => {
    expect(matchesEmailOnFile("teacher@school.zw", "rudo@example.com")).toBe(false);
    expect(matchesEmailOnFile("rudo@example.com", null)).toBe(false);
  });
});

describe("signedInWithPassword", () => {
  it("is true for a password sign in", () => {
    expect(signedInWithPassword([{ method: "password", timestamp: 1 }])).toBe(true);
  });

  it("is false for an invite link session or bad claims", () => {
    expect(signedInWithPassword([{ method: "otp", timestamp: 1 }])).toBe(false);
    expect(signedInWithPassword(undefined)).toBe(false);
    expect(signedInWithPassword([null])).toBe(false);
  });
});
