import { describe, expect, it } from "vitest";
import {
  CLASS_COMMENT_MAX,
  SUBJECT_COMMENT_MAX,
  charactersLeft,
  checkComment,
  parseBankEntry,
  suggestionsFor,
  termHasClassComments,
  type BankEntry,
} from "@/lib/comments/rules";

describe("checkComment", () => {
  it("trims and joins lines into one paragraph", () => {
    expect(checkComment("  Works hard.\n\nKeep  going. ", SUBJECT_COMMENT_MAX, false)).toEqual({
      ok: true,
      text: "Works hard. Keep going.",
    });
  });

  it("allows exactly the limit and refuses one more", () => {
    expect(checkComment("x".repeat(SUBJECT_COMMENT_MAX), SUBJECT_COMMENT_MAX, true).ok).toBe(true);
    expect(checkComment("x".repeat(SUBJECT_COMMENT_MAX + 1), SUBJECT_COMMENT_MAX, true)).toEqual({
      ok: false,
      message: "Use at most 100 characters (101 now).",
    });
    expect(checkComment("x".repeat(CLASS_COMMENT_MAX), CLASS_COMMENT_MAX, true).ok).toBe(true);
  });

  it("allows a blank draft but not a blank comment marked done", () => {
    expect(checkComment("   ", SUBJECT_COMMENT_MAX, false)).toEqual({ ok: true, text: "" });
    expect(checkComment("   ", SUBJECT_COMMENT_MAX, true)).toEqual({
      ok: false,
      message: "Write a comment before marking it done.",
    });
    expect(checkComment(42, SUBJECT_COMMENT_MAX, false).ok).toBe(false);
  });
});

describe("charactersLeft", () => {
  it("counts down and then over", () => {
    expect(charactersLeft("abc", 4)).toBe("1 character left");
    expect(charactersLeft("abcd", 4)).toBe("0 characters left");
    expect(charactersLeft("abcdef", 4)).toBe("2 characters too many");
    expect(charactersLeft("a  b", 3)).toBe("0 characters left");
  });
});

describe("termHasClassComments", () => {
  it("is off for vacation school only (Q8)", () => {
    expect(termHasClassComments("term")).toBe(true);
    expect(termHasClassComments("mock")).toBe(true);
    expect(termHasClassComments("vacation")).toBe(false);
  });
});

describe("suggestionsFor", () => {
  const entry = (id: string, over: Partial<BankEntry>): BankEntry => ({
    id,
    text: id,
    subjectId: null,
    grade: null,
    isShared: false,
    isMine: true,
    ...over,
  });
  const entries = [
    entry("any", {}),
    entry("maths-a", { subjectId: "maths", grade: "A" }),
    entry("maths-any", { subjectId: "maths" }),
    entry("english-a", { subjectId: "english", grade: "A" }),
    entry("a-shared", { grade: "a", isMine: false, isShared: true }),
    entry("b", { grade: "B" }),
    entry("long", { text: "x".repeat(101) }),
  ];

  it("matches the subject and grade, best first", () => {
    expect(
      suggestionsFor(entries, { subjectId: "maths", grade: "A", maxLength: 100 }).map((e) => e.id),
    ).toEqual(["maths-a", "a-shared", "maths-any", "any"]);
  });

  it("offers only any-grade entries when the learner has no grade", () => {
    expect(
      suggestionsFor(entries, { subjectId: "maths", grade: null, maxLength: 100 }).map((e) => e.id),
    ).toEqual(["maths-any", "any"]);
  });

  it("leaves out entries too long for the box", () => {
    expect(
      suggestionsFor(entries, { subjectId: null, grade: null, maxLength: 300 }).map((e) => e.id),
    ).toEqual(["any", "long"]);
  });
});

describe("parseBankEntry", () => {
  it("reads text, grade, subject and sharing", () => {
    expect(
      parseBankEntry({ text: " Good work ", grade: " b ", subjectId: "s1", shared: "on" }),
    ).toEqual({
      ok: true,
      value: { text: "Good work", grade: "B", subjectId: "s1", shared: true },
    });
    expect(parseBankEntry({ text: "Hi", grade: "", subjectId: "", shared: null })).toEqual({
      ok: true,
      value: { text: "Hi", grade: null, subjectId: null, shared: false },
    });
  });

  it("refuses blank or too long text", () => {
    expect(parseBankEntry({ text: " ", grade: "", subjectId: "", shared: null })).toEqual({
      ok: false,
      errors: { text: "Type the comment to save." },
    });
    expect(
      parseBankEntry({ text: "x".repeat(301), grade: "", subjectId: "", shared: null }).ok,
    ).toBe(false);
  });
});
