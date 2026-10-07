import { describe, expect, it } from "vitest";
import { BLOCK_MS, lockedUntil, minutesLeft, type SignInAttempt } from "@/lib/auth/lockout";

const t0 = new Date("2026-10-07T10:00:00Z").getTime();
const min = 60_000;
const fail = (m: number): SignInAttempt => ({ at: new Date(t0 + m * min), succeeded: false });
const ok = (m: number): SignInAttempt => ({ at: new Date(t0 + m * min), succeeded: true });
const at = (m: number) => new Date(t0 + m * min);

describe("lockedUntil", () => {
  it("allows sign in after four failures", () => {
    expect(lockedUntil([fail(0), fail(1), fail(2), fail(3)], at(4))).toBeNull();
  });

  it("blocks for 15 minutes from the fifth failure within 10 minutes", () => {
    const attempts = [fail(0), fail(2), fail(4), fail(6), fail(9)];
    expect(lockedUntil(attempts, at(10))).toEqual(new Date(t0 + 9 * min + BLOCK_MS));
    expect(lockedUntil(attempts, at(23.9))).not.toBeNull();
    expect(lockedUntil(attempts, at(24))).toBeNull();
  });

  it("counts exactly 10 minutes between the first and fifth failure as within the window", () => {
    expect(lockedUntil([fail(0), fail(1), fail(2), fail(3), fail(10)], at(11))).not.toBeNull();
  });

  it("does not block five failures spread over more than 10 minutes", () => {
    expect(lockedUntil([fail(0), fail(3), fail(6), fail(9), fail(10.5)], at(11))).toBeNull();
  });

  it("forgets failures before a successful sign in", () => {
    expect(lockedUntil([fail(0), fail(1), fail(2), ok(3), fail(4), fail(5)], at(6))).toBeNull();
  });

  it("does not depend on the order attempts are given in", () => {
    const attempts = [fail(9), fail(0), fail(6), fail(2), fail(4)];
    expect(lockedUntil(attempts, at(10))).not.toBeNull();
  });
});

describe("minutesLeft", () => {
  it("rounds up and never shows zero", () => {
    expect(minutesLeft(at(15), at(0.5))).toBe(15);
    expect(minutesLeft(at(1), at(0.99))).toBe(1);
  });
});
