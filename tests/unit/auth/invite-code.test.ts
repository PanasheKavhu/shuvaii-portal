import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  inviteLink,
  normalizeInviteCode,
} from "@/lib/auth/invite-code";

describe("generateInviteCode", () => {
  it("makes 12 characters from the look-alike-free alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode(randomInt);
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("uses the random source for every character", () => {
    expect(generateInviteCode(() => 0)).toBe("222222222222");
    expect(generateInviteCode((max) => max - 1)).toBe("ZZZZZZZZZZZZ");
  });
});

describe("formatInviteCode and normalizeInviteCode", () => {
  it("groups the code in fours", () => {
    expect(formatInviteCode("ABCD2345WXYZ")).toBe("ABCD-2345-WXYZ");
  });

  it("ignores case, spaces and dashes", () => {
    expect(normalizeInviteCode(" abcd-2345 wxyz ")).toBe("ABCD2345WXYZ");
    expect(normalizeInviteCode(formatInviteCode("ABCD2345WXYZ"))).toBe("ABCD2345WXYZ");
  });

  it("rejects wrong lengths, look-alikes and non-strings", () => {
    expect(normalizeInviteCode("ABCD-2345")).toBeNull();
    expect(normalizeInviteCode("ABCD-2345-WXY0")).toBeNull();
    expect(normalizeInviteCode("ABCD-2345-WXYI")).toBeNull();
    expect(normalizeInviteCode(null)).toBeNull();
  });
});

describe("hashInviteCode and inviteLink", () => {
  it("hashes to 64 hex characters, the same for the same code", () => {
    const hash = hashInviteCode("ABCD2345WXYZ");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode("ABCD2345WXYZ")).toBe(hash);
    expect(hashInviteCode("ABCD2345WXYY")).not.toBe(hash);
  });

  it("builds the join link with the grouped code", () => {
    expect(inviteLink("https://portal.example/", "ABCD2345WXYZ")).toBe(
      "https://portal.example/join?code=ABCD-2345-WXYZ",
    );
  });
});
