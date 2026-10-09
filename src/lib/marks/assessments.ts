/**
 * Assessments of a class subject in a term (US-4.1): form parsing, the
 * school's usual set and the running weight total. Pure; the database
 * repeats every rule (D30).
 */

import { fraction, parseDecimal, roundHalfUp, sum, type Fraction } from "@/lib/grading/decimal";
import type { Parse } from "@/lib/setup/structure";

export const ASSESSMENT_TYPES = ["test", "assignment", "exam", "practical", "vacation"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  test: "Test",
  assignment: "Assignment",
  exam: "Exam",
  practical: "Practical",
  vacation: "Vacation school",
};

export type AssessmentDraft = {
  name: string;
  type: AssessmentType;
  maxMark: string;
  weightPercent: string;
};

/**
 * The usual term set (GRADING_AND_WEIGHTS section 4, assumed until the
 * school confirms Q5): Test 1 out of 30 at 20%, Test 2 out of 50 at 20%
 * and the exam out of 100 at 60%. A vacation term gets one mark out of 100.
 */
export const USUAL_TERM_SET: readonly AssessmentDraft[] = [
  { name: "Test 1", type: "test", maxMark: "30", weightPercent: "20" },
  { name: "Test 2", type: "test", maxMark: "50", weightPercent: "20" },
  { name: "Exam", type: "exam", maxMark: "100", weightPercent: "60" },
];
export const USUAL_VACATION_SET: readonly AssessmentDraft[] = [
  { name: "Vacation school mark", type: "vacation", maxMark: "100", weightPercent: "100" },
];

export function usualSet(termKind: string): readonly AssessmentDraft[] {
  return termKind === "vacation" ? USUAL_VACATION_SET : USUAL_TERM_SET;
}

/** "Test 1, Test 2 and Exam". */
export function describeSet(set: readonly AssessmentDraft[]): string {
  const names = set.map((a) => a.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** A positive decimal up to `max` with at most 2 decimal places, as typed. */
function amount(value: unknown, max: number): string | null {
  const t = text(value);
  const n = parseDecimal(t);
  if (!n || n.num === BigInt(0) || (t.split(".")[1]?.length ?? 0) > 2) return null;
  if (n.num > BigInt(max) * n.den) return null;
  return t;
}

export function parseAssessment(form: {
  name: unknown;
  type: unknown;
  maxMark: unknown;
  weightPercent: unknown;
}): Parse<AssessmentDraft> {
  const errors: Partial<Record<keyof AssessmentDraft, string>> = {};
  const name = text(form.name);
  if (name.length < 1 || name.length > 80) errors.name = "Give the assessment a name.";
  const type = form.type;
  if (typeof type !== "string" || !(ASSESSMENT_TYPES as readonly string[]).includes(type))
    errors.type = "Choose a type.";
  const maxMark = amount(form.maxMark, 1000);
  if (!maxMark) errors.maxMark = "Enter a maximum mark from 1 to 1000.";
  const weightPercent = amount(form.weightPercent, 100);
  if (!weightPercent) errors.weightPercent = "Enter a weight above 0 and at most 100.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, type: type as AssessmentType, maxMark: maxMark!, weightPercent: weightPercent! },
  };
}

/** The total weight of a set of assessments, exact, e.g. 100 or 92.5. */
export function weightTotal(weights: readonly (number | string)[]): number {
  const parts = weights.map((w) => parseDecimal(w)).filter((w): w is Fraction => w !== null);
  return roundHalfUp(parts.length ? sum(parts) : fraction(BigInt(0)), 2);
}

/** What the running total says under the assessments list (Q5). */
export function weightMessage(total: number, count: number): { ok: boolean; text: string } {
  if (count === 0) return { ok: false, text: "No assessments yet. Weights must add up to 100." };
  if (total === 100) return { ok: true, text: "Weights add up to 100." };
  const gap = Math.abs(Math.round((100 - total) * 100) / 100);
  return {
    ok: false,
    text:
      total < 100
        ? `Weights add up to ${total}, ${gap} short of 100. Results stay incomplete until they reach 100.`
        : `Weights add up to ${total}, ${gap} over 100. Results stay incomplete until they add up to 100.`,
  };
}
