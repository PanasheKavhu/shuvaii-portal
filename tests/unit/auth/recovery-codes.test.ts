import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
} from "@/lib/auth/recovery-codes";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("generateRecoveryCodes", () => {
  it("makes ten different codes of two groups of five, with no look-alike characters", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it("does not repeat between sets", () => {
    const all = Array.from({ length: 50 }, () => generateRecoveryCodes()).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("normaliseRecoveryCode", () => {
  it("accepts the code as shown, in lower case, or with spaces instead of the dash", () => {
    expect(normaliseRecoveryCode("ABCDE-FGH23")).toBe("ABCDEFGH23");
    expect(normaliseRecoveryCode(" abcde fgh23 ")).toBe("ABCDEFGH23");
  });

  it("refuses wrong lengths, look-alikes and non-strings", () => {
    expect(normaliseRecoveryCode("ABCDE-FGH2")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGH234")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGH20")).toBeNull();
    expect(normaliseRecoveryCode("OBCDE-FGH23")).toBeNull();
    expect(normaliseRecoveryCode(42)).toBeNull();
  });
});

describe("hashRecoveryCode", () => {
  it("is a SHA-256 hex digest that never contains the code", () => {
    const hash = hashRecoveryCode(USER_A, "ABCDEFGH23");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("ABCDEFGH23");
  });

  it("is the same for the same person and code, however it was typed", () => {
    const typed = normaliseRecoveryCode("abcde fgh23")!;
    expect(hashRecoveryCode(USER_A, typed)).toBe(hashRecoveryCode(USER_A, "ABCDEFGH23"));
  });

  it("differs between people and between codes", () => {
    expect(hashRecoveryCode(USER_A, "ABCDEFGH23")).not.toBe(hashRecoveryCode(USER_B, "ABCDEFGH23"));
    expect(hashRecoveryCode(USER_A, "ABCDEFGH23")).not.toBe(hashRecoveryCode(USER_A, "ABCDEFGH24"));
  });

  it("matches a known digest, so stored hashes stay valid", () => {
    expect(hashRecoveryCode(USER_A, "ABCDEFGH23")).toBe(
      "004f29251a299c0d9945581dbdcf2c66bf54baecdec7bac005a9e25ac2fac0c4",
    );
  });
});
