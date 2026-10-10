import { describe, expect, it } from "vitest";
import { asSentence, dbErrorMessage } from "@/lib/db-errors";

const messages = {
  notAllowed: "Not allowed.",
  locked: "Locked.",
  duplicate: "Already exists.",
  inUse: "In use.",
  fallback: "Try again.",
};

describe("dbErrorMessage", () => {
  it("tells a lock from any other refusal", () => {
    expect(dbErrorMessage({ code: "42501", message: "marks are locked" }, messages)).toBe(
      "Locked.",
    );
    expect(dbErrorMessage({ code: "42501", message: "row-level security" }, messages)).toBe(
      "Not allowed.",
    );
    const noLock = { ...messages, locked: undefined };
    expect(dbErrorMessage({ code: "42501", message: "marks are locked" }, noLock)).toBe(
      "Not allowed.",
    );
  });

  it("shows our own check messages as a sentence", () => {
    for (const code of ["23514", "22023", "P0001"]) {
      expect(
        dbErrorMessage({ code, message: "the score must be between 0 and 30" }, messages),
      ).toBe("The score must be between 0 and 30.");
    }
  });

  it("uses the duplicate and in-use messages, or the fallback without them", () => {
    expect(dbErrorMessage({ code: "23505", message: "x" }, messages)).toBe("Already exists.");
    expect(dbErrorMessage({ code: "23503", message: "x" }, messages)).toBe("In use.");
    const plain = { notAllowed: "Not allowed.", fallback: "Try again." };
    expect(dbErrorMessage({ code: "23505", message: "x" }, plain)).toBe("Try again.");
    expect(dbErrorMessage({ message: "fetch failed" }, plain)).toBe("Try again.");
  });

  it("adds a full stop only when missing", () => {
    expect(asSentence("done.")).toBe("Done.");
  });
});
