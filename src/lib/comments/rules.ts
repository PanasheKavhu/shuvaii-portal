/**
 * Subject and class teacher comments and the comment bank (US-5.1 to
 * US-5.3; D34). Pure; the database repeats the length, done and vacation
 * rules (migration `comments`).
 */

/** Two lines of the report's comment column at 9 pt (REPORT_LAYOUT.md, D34). */
export const SUBJECT_COMMENT_MAX = 100;
/** Three lines across the report page (D34). */
export const CLASS_COMMENT_MAX = 300;
/** Q28: configurable per school with the report templates (Phase 4). */
export const SUBJECT_COMMENT_LABEL = "Teacher's comment";

export type CommentStatus = "draft" | "submitted";

export type CommentCheck = { ok: true; text: string } | { ok: false; message: string };

/**
 * Reads a comment as typed: trimmed, with runs of spaces and line breaks
 * made one space (it prints as one paragraph in a report row). Blank is
 * allowed for a draft; marking done needs text.
 */
export function checkComment(text: unknown, max: number, done: boolean): CommentCheck {
  if (typeof text !== "string") return { ok: false, message: "Type a comment." };
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length > max)
    return { ok: false, message: `Use at most ${max} characters (${value.length} now).` };
  if (done && value === "")
    return { ok: false, message: "Write a comment before marking it done." };
  return { ok: true, text: value };
}

/** "12 characters left" or "3 characters too many". */
export function charactersLeft(text: string, max: number): string {
  const left = max - text.replace(/\s+/g, " ").trim().length;
  if (left >= 0) return `${left} ${left === 1 ? "character" : "characters"} left`;
  return `${-left} ${left === -1 ? "character" : "characters"} too many`;
}

/** Class comments are for term reports, not vacation school (Q8). */
export function termHasClassComments(kind: "term" | "vacation" | "mock"): boolean {
  return kind !== "vacation";
}

// Comment bank ------------------------------------------------------------------------

export type BankEntry = {
  id: string;
  text: string;
  /** Null: any subject. */
  subjectId: string | null;
  /** Null: any grade. */
  grade: string | null;
  isShared: boolean;
  isMine: boolean;
};

/**
 * Bank entries to suggest for one learner (US-5.2): those for this subject
 * or any subject, for the learner's grade or any grade, short enough for
 * the box. The learner's grade first, then this subject's, then the
 * viewer's own, then by text. With no grade (an incomplete result) only
 * entries for any grade are suggested.
 */
export function suggestionsFor(
  entries: readonly BankEntry[],
  target: { subjectId: string | null; grade: string | null; maxLength: number },
): BankEntry[] {
  const grade = target.grade?.trim().toUpperCase() ?? null;
  const rank = (e: BankEntry) => (e.grade ? 0 : 4) + (e.subjectId ? 0 : 2) + (e.isMine ? 0 : 1);
  return entries
    .filter(
      (e) =>
        (e.subjectId === null || e.subjectId === target.subjectId) &&
        (e.grade === null || (grade !== null && e.grade.trim().toUpperCase() === grade)) &&
        e.text.length <= target.maxLength,
    )
    .sort((a, b) => rank(a) - rank(b) || a.text.localeCompare(b.text));
}

export type BankInput = {
  text: string;
  grade: string | null;
  subjectId: string | null;
  shared: boolean;
};

/** A bank entry from the form (text, optional grade and subject, shared). */
export function parseBankEntry(form: {
  text: unknown;
  grade: unknown;
  subjectId: unknown;
  shared: unknown;
}): { ok: true; value: BankInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const checked = checkComment(form.text, CLASS_COMMENT_MAX, false);
  if (!checked.ok) errors.text = checked.message;
  else if (checked.text === "") errors.text = "Type the comment to save.";
  const grade = typeof form.grade === "string" ? form.grade.trim().toUpperCase() : "";
  if (grade.length > 10) errors.grade = "Use a grade from the school's scale.";
  const subjectId =
    typeof form.subjectId === "string" && form.subjectId !== "" ? form.subjectId : null;
  if (!checked.ok || Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      text: checked.text,
      grade: grade || null,
      subjectId,
      shared: form.shared === "on" || form.shared === true,
    },
  };
}
