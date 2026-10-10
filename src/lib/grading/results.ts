/**
 * Subject results, class averages and positions (DATA_MODEL section 6,
 * GRADING_AND_WEIGHTS section 4, D31). Pure. Mirrors
 * `public.subject_results()` and `public.class_positions()` so the marks grid
 * can show a live result while a teacher types, with the same numbers the
 * reports and the portal read from the database.
 */

import { gradeFor, type Band } from "@/lib/setup/bands";
import {
  divide,
  equals,
  fraction,
  multiply,
  parseDecimal,
  roundHalfUp,
  sum,
  type Fraction,
} from "./decimal";

export type MarkStatus = "present" | "absent" | "excused";

/** One assessment of a class subject in a term, with this learner's mark if there is one. */
export type AssessmentWithMark = {
  maxMark: number | string;
  weightPercent: number | string;
  mark?: { status: MarkStatus; score?: number | string | null } | null;
};

/** In order of precedence: the first that applies is the reason given. */
export type IncompleteReason = "weights_not_100" | "absent" | "excused" | "missing_mark";

export type SubjectResult =
  | {
      status: "complete";
      /** Weighted percentage to 2 decimals, before rounding. */
      weightedPercent: number;
      /** The whole mark printed on the report. */
      roundedMark: number;
      /** null only when the scale has no band for the mark. */
      grade: string | null;
    }
  | { status: "incomplete"; reason: IncompleteReason };

const HUNDRED = fraction(BigInt(100));

/** Whether the assessments' weights add up to exactly 100. */
export function weightsAreComplete(
  assessments: readonly Pick<AssessmentWithMark, "weightPercent">[],
): boolean {
  const weights = assessments.map((a) => parseDecimal(a.weightPercent));
  if (weights.some((w) => w === null)) return false;
  return equals(sum(weights as Fraction[]), HUNDRED);
}

/**
 * The result of one learner in one class subject for a term: the sum of
 * score / max_mark * weight_percent, rounded half up to a whole mark and
 * graded from `bands`. Incomplete (Q6) when the weights do not add up to
 * 100, or any assessment is absent, excused or has no mark yet. A score
 * that is not a number from 0 to the maximum (half typed) counts as no
 * mark yet. Returns null when the subject has no assessments in the term.
 */
export function subjectResult(
  assessments: readonly AssessmentWithMark[],
  bands: readonly Band[],
): SubjectResult | null {
  if (assessments.length === 0) return null;
  if (!weightsAreComplete(assessments)) return { status: "incomplete", reason: "weights_not_100" };

  const statuses = assessments.map((a) => a.mark?.status);
  if (statuses.includes("absent")) return { status: "incomplete", reason: "absent" };
  if (statuses.includes("excused")) return { status: "incomplete", reason: "excused" };

  const parts: Fraction[] = [];
  for (const a of assessments) {
    const max = parseDecimal(a.maxMark);
    const weight = parseDecimal(a.weightPercent);
    const score = a.mark?.score == null ? null : parseDecimal(a.mark.score);
    if (
      !max ||
      !weight ||
      max.num === BigInt(0) ||
      !score ||
      score.num * max.den > max.num * score.den
    ) {
      return { status: "incomplete", reason: "missing_mark" };
    }
    parts.push(divide(multiply(score, weight), max));
  }

  const weighted = sum(parts);
  const roundedMark = roundHalfUp(weighted);
  return {
    status: "complete",
    weightedPercent: roundHalfUp(weighted, 2),
    roundedMark,
    grade: gradeFor(bands, roundedMark),
  };
}

/** Mean of completed rounded results to one decimal, half up; null when there are none. */
export function classAverage(roundedMarks: readonly number[]): number | null {
  if (roundedMarks.length === 0) return null;
  const total = roundedMarks.reduce((acc, mark) => acc + BigInt(mark), BigInt(0));
  return roundHalfUp(fraction(total, BigInt(roundedMarks.length)), 1);
}

/**
 * The grade of an average as shown (one decimal), rounded half up to a whole
 * mark: an average shown as 69.5 is graded as 70 (D34, D37). Used for the
 * class comment suggestions.
 */
export function averageGrade(bands: readonly Band[], average: number | null): string | null {
  const exact = average === null ? null : parseDecimal(average);
  return exact ? gradeFor(bands, roundHalfUp(exact)) : null;
}

/**
 * Competition ranking, highest first: equal values share a position and the
 * next position is skipped (1, 2, 2, 4; Q7). null values get no position.
 */
export function competitionRanks(values: readonly (number | null)[]): (number | null)[] {
  const ranked = values.filter((v): v is number => v !== null).sort((a, b) => b - a);
  return values.map((v) => (v === null ? null : ranked.indexOf(v) + 1));
}

/** Enrolment statuses that mean the learner is no longer in the class. */
const LEFT_CLASS = new Set(["transferred", "left"]);

export type PositionInput = {
  enrolmentId: string;
  enrolmentStatus: string;
  /** Rounded marks of the learner's completed subjects this term. */
  completedMarks: readonly number[];
};

export type ClassPosition = {
  enrolmentId: string;
  subjectsCounted: number;
  average: number | null;
  position: number | null;
  classSize: number | null;
};

/**
 * Average and position of every learner in a class for a term. Learners
 * who have left the class (transferred, left) and learners with no
 * completed subject get no position; class size counts the learners still
 * in the class. Vacation terms have averages but no positions or class
 * size (Q8).
 */
export function classPositions(
  learners: readonly PositionInput[],
  termKind: "term" | "vacation" | "mock",
): ClassPosition[] {
  const ranked = termKind !== "vacation";
  const averages = learners.map((l) => classAverage(l.completedMarks));
  const inClass = learners.map((l) => ranked && !LEFT_CLASS.has(l.enrolmentStatus));
  const positions = competitionRanks(averages.map((avg, i) => (inClass[i] ? avg : null)));
  const classSize = ranked ? inClass.filter(Boolean).length : null;
  return learners.map((l, i) => ({
    enrolmentId: l.enrolmentId,
    subjectsCounted: l.completedMarks.length,
    average: averages[i]!,
    position: positions[i]!,
    classSize,
  }));
}
