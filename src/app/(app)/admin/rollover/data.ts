import "server-only";

import {
  defaultOutcome,
  proposeTarget,
  repeatTarget,
  type ClassTarget,
  type LearnerOutcome,
  type RolloverClass,
  type RolloverLevel,
} from "@/lib/rollover/plan";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { listClasses, listLevels, listYears, type YearRow } from "../setup/data";

/**
 * Reads for the Roll over screen (US-3.5, D53), through the school admin's
 * own client: the current year, the later years it can roll into, and
 * every class of the current year with the learners still enrolled in it.
 */

export type RolloverLearnerRow = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  learnerNumber: string;
  outcome: LearnerOutcome;
};

export type RolloverClassRow = RolloverClass & {
  levelName: string;
  proposed: ClassTarget;
  /** Where a repeater goes: next year's class of this name and level, or a new one. */
  repeatsIn: string;
  learners: RolloverLearnerRow[];
};

export type RolloverView = {
  fromYear: YearRow | null;
  laterYears: YearRow[];
  toYear: YearRow | null;
  levels: RolloverLevel[];
  nextClasses: RolloverClass[];
  classes: RolloverClassRow[];
  /** Learners already enrolled in the next year (by a rollover or by hand). */
  nextYearLearners: number;
};

type EnrolmentRow = {
  id: string;
  class_id: string;
  status: string;
  learner_id: string;
  learners: { first_name: string; last_name: string; learner_number: string };
};

/** Every enrolment of a year, a thousand at a time (the API's page size). */
async function yearEnrolments(yearId: string): Promise<EnrolmentRow[]> {
  const supabase = await createClient();
  const out: EnrolmentRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = rowsOrThrow(
      await supabase
        .from("enrolments")
        .select(
          "id, class_id, status, learner_id, learners!inner(first_name, last_name, learner_number)",
        )
        .eq("academic_year_id", yearId)
        .order("id")
        .range(from, from + 999),
      "rollover",
      "Could not load this year's learners. Please try again.",
    );
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export async function loadRollover(schoolId: string, toYearId?: string): Promise<RolloverView> {
  const [years, levelRows] = await Promise.all([listYears(schoolId), listLevels(schoolId)]);
  const fromYear = years.find((y) => y.isCurrent) ?? null;
  const levels = levelRows.map((l) => ({ id: l.id, name: l.name, sortOrder: l.sortOrder }));
  const laterYears = fromYear
    ? years
        .filter((y) => y.startsOn > fromYear.startsOn)
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    : [];
  const toYear = laterYears.find((y) => y.id === toYearId) ?? laterYears[0] ?? null;
  if (!fromYear)
    return {
      fromYear,
      laterYears,
      toYear,
      levels,
      nextClasses: [],
      classes: [],
      nextYearLearners: 0,
    };

  const supabase = await createClient();
  const [classes, nextClassRows, enrolments, nextCount] = await Promise.all([
    listClasses(fromYear.id),
    toYear ? listClasses(toYear.id) : Promise.resolve([]),
    yearEnrolments(fromYear.id),
    toYear
      ? supabase
          .from("enrolments")
          .select("id", { count: "exact", head: true })
          .eq("academic_year_id", toYear.id)
      : Promise.resolve({ count: 0 }),
  ]);
  const nextClasses = nextClassRows.map((c) => ({
    id: c.id,
    name: c.name,
    gradeLevelId: c.gradeLevelId,
  }));
  const levelName = new Map(levels.map((l) => [l.id, l.name]));
  const nextName = new Map(nextClasses.map((c) => [c.id, c.name]));

  const rows: RolloverClassRow[] = classes.map((c) => {
    const klass = { id: c.id, name: c.name, gradeLevelId: c.gradeLevelId };
    const proposed = toYear
      ? proposeTarget(klass, levels, nextClasses)
      : ({ kind: "skip" } as const);
    const repeat = repeatTarget(klass, nextClasses);
    const learners = enrolments
      .filter((e) => e.class_id === c.id && e.status === "enrolled")
      .sort(
        (a, b) =>
          a.learners.last_name.localeCompare(b.learners.last_name) ||
          a.learners.first_name.localeCompare(b.learners.first_name),
      )
      .map((e) => ({
        enrolmentId: e.id,
        learnerId: e.learner_id,
        name: `${e.learners.first_name} ${e.learners.last_name}`,
        learnerNumber: e.learners.learner_number,
        outcome: defaultOutcome(proposed),
      }));
    return {
      ...klass,
      levelName: levelName.get(c.gradeLevelId) ?? "",
      proposed,
      repeatsIn:
        repeat.kind === "existing" ? (nextName.get(repeat.classId) ?? c.name) : repeat.name,
      learners,
    };
  });

  return {
    fromYear,
    laterYears,
    toYear,
    levels,
    nextClasses,
    classes: rows.filter((r) => r.learners.length > 0),
    nextYearLearners: nextCount.count ?? 0,
  };
}
