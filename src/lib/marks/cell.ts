/**
 * What a teacher types in one marks grid cell (US-4.2, US-4.4). Pure; the
 * database repeats the score rules (D30).
 *
 * A cell holds a score from 0 to the assessment's maximum, "A" for absent
 * or "E" for excused. Anything else is refused in the cell and not saved.
 */

import type { IncompleteReason, MarkStatus } from "@/lib/grading/results";
import { parseDecimal } from "@/lib/grading/decimal";

export type CellValue =
  | { kind: "empty" }
  | { kind: "score"; score: string }
  | { kind: "absent" }
  | { kind: "excused" }
  | { kind: "invalid"; message: string };

const ABSENT = /^a(bs(ent)?)?$/i;
const EXCUSED = /^e(xc(used)?)?$/i;
const MAX_DECIMALS = 2;

/** Reads a cell's text against the assessment's maximum mark. */
export function parseCell(text: string, maxMark: number | string): CellValue {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  if (ABSENT.test(t)) return { kind: "absent" };
  if (EXCUSED.test(t)) return { kind: "excused" };

  if (/^-\s*\d/.test(t)) return { kind: "invalid", message: "A mark cannot be below 0." };
  const score = parseDecimal(t);
  if (!score) return { kind: "invalid", message: "Type a number, A for absent or E for excused." };
  const decimals = t.split(".")[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS)
    return { kind: "invalid", message: `Use at most ${MAX_DECIMALS} decimal places.` };

  const max = parseDecimal(maxMark);
  if (max && score.num * max.den > max.num * score.den)
    return { kind: "invalid", message: `${t} is more than the maximum of ${String(maxMark)}.` };
  return { kind: "score", score: normalise(t) };
}

/** "07.50" → "7.5", "20.0" → "20". */
function normalise(t: string): string {
  const [whole, frac = ""] = t.split(".");
  const w = whole!.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");
  return f ? `${w}.${f}` : w;
}

/** The text a saved mark shows in its cell. */
export function cellText(
  mark: { status: MarkStatus; score: number | string | null } | null | undefined,
): string {
  if (!mark) return "";
  if (mark.status === "absent") return "A";
  if (mark.status === "excused") return "E";
  return mark.score == null ? "" : normalise(String(mark.score));
}

/** A cell value as a mark for the live result; null when there is no mark yet. */
export function cellMark(value: CellValue): { status: MarkStatus; score: string | null } | null {
  switch (value.kind) {
    case "score":
      return { status: "present", score: value.score };
    case "absent":
      return { status: "absent", score: null };
    case "excused":
      return { status: "excused", score: null };
    default:
      return null;
  }
}

const REASONS: Record<IncompleteReason, string> = {
  weights_not_100: "weights do not add up to 100",
  absent: "absent",
  excused: "excused",
  missing_mark: "a mark is missing",
};

/** "Incomplete: absent" and so on, for the result column. */
export function describeIncomplete(reason: string | null): string {
  const text = reason && reason in REASONS ? REASONS[reason as IncompleteReason] : null;
  return text ? `Incomplete: ${text}` : "Incomplete";
}
