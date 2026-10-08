import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generatePin,
  isWeakPin,
  learnerAttemptHash,
  learnerAuthEmail,
  mustChangePin,
  parseLearnerSignIn,
  parseNewPin,
  pinPassword,
} from "@/lib/auth/learner-pin";

const SCHOOL = "9341cf1e-f77b-5e4a-abbe-6a72f8c4a2fa";

describe("parseLearnerSignIn", () => {
  it("normalises the learner number and PIN", () => {
    expect(
      parseLearnerSignIn({ schoolId: SCHOOL, learnerNumber: " msh260001 ", pin: "246 810" }),
    ).toEqual({ ok: true, value: { schoolId: SCHOOL, learnerNumber: "MSH260001", pin: "246810" } });
  });

  it("asks for a school, a number and a PIN", () => {
    expect(parseLearnerSignIn({ schoolId: "", learnerNumber: "A1", pin: "246810" })).toEqual({
      ok: false,
      error: "Choose your school.",
    });
    expect(parseLearnerSignIn({ schoolId: SCHOOL, learnerNumber: "", pin: "" })).toEqual({
      ok: false,
      error: "Enter your learner number and PIN.",
    });
  });

  it("answers a malformed PIN like a wrong one", () => {
    for (const pin of ["12345", "1234567", "12a456"]) {
      expect(parseLearnerSignIn({ schoolId: SCHOOL, learnerNumber: "A1", pin })).toEqual({
        ok: false,
        error: "Learner number or PIN is incorrect.",
      });
    }
  });
});

describe("isWeakPin and parseNewPin", () => {
  it("flags repeats and runs, including ones that wrap", () => {
    for (const pin of ["000000", "777777", "123456", "654321", "890123", "345678"]) {
      expect(isWeakPin(pin)).toBe(true);
    }
    for (const pin of ["246810", "135790", "482913", "112233"]) {
      expect(isWeakPin(pin)).toBe(false);
    }
  });

  it("accepts six matching digits", () => {
    expect(parseNewPin({ pin: "482 913", confirm: "482913" })).toEqual({
      ok: true,
      value: "482913",
    });
  });

  it("explains what is wrong", () => {
    expect(parseNewPin({ pin: "4829", confirm: "4829" })).toEqual({
      ok: false,
      error: "Use exactly 6 digits.",
    });
    expect(parseNewPin({ pin: "123456", confirm: "123456" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("too easy to guess"),
    });
    expect(parseNewPin({ pin: "482913", confirm: "482914" })).toEqual({
      ok: false,
      error: "The two PINs do not match.",
    });
  });
});

describe("generatePin", () => {
  it("makes six digits that are never weak", () => {
    for (let i = 0; i < 200; i++) {
      const pin = generatePin(randomInt);
      expect(pin).toMatch(/^\d{6}$/);
      expect(isWeakPin(pin)).toBe(false);
    }
  });

  it("draws again when the first PIN is weak", () => {
    const digits = [1, 1, 1, 1, 1, 1, 4, 8, 2, 9, 1, 3];
    expect(generatePin(() => digits.shift()!)).toBe("482913");
  });
});

describe("account helpers", () => {
  it("counts attempts per school and learner number, ignoring case", () => {
    const hash = learnerAttemptHash(SCHOOL, "msh260001");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(learnerAttemptHash(SCHOOL, " MSH260001")).toBe(hash);
    expect(learnerAttemptHash("f2856ae5-c561-5f69-8db8-0495481bb2b0", "MSH260001")).not.toBe(hash);
  });

  it("gives learners an address that never receives mail", () => {
    expect(learnerAuthEmail("abc")).toBe("abc@learners.sp-portal.invalid");
  });

  it("derives a password that depends on the secret, the account and the PIN", () => {
    const password = pinPassword("secret", "user-1", "482913");
    expect(password).toHaveLength(43);
    expect(pinPassword("secret", "user-1", "482913")).toBe(password);
    expect(pinPassword("other", "user-1", "482913")).not.toBe(password);
    expect(pinPassword("secret", "user-2", "482913")).not.toBe(password);
    expect(pinPassword("secret", "user-1", "482914")).not.toBe(password);
  });

  it("reads the must-change flag from app_metadata", () => {
    expect(mustChangePin({ pin_must_change: true })).toBe(true);
    expect(mustChangePin({ pin_must_change: false })).toBe(false);
    expect(mustChangePin(undefined)).toBe(false);
  });
});
