/**
 * Year rollover (US-3.5, D52): the pure rules behind the Roll over screen.
 * Which level a class moves up to, the name proposed for its new class,
 * each class's proposed target, and the plan sent to public.roll_over_year().
 * No I/O, so the screen, the server action and the unit tests share them.
 */

export type RolloverLevel = { id: string; name: string; sortOrder: number };
export type RolloverClass = { id: string; name: string; gradeLevelId: string };

/** Where a class's learners go by default. */
export type ClassTarget =
  | { kind: "existing"; classId: string }
  | { kind: "new"; name: string; gradeLevelId: string }
  | { kind: "graduate" }
  | { kind: "skip" };

/** What happens to one learner. */
export type LearnerOutcome = "up" | "repeat" | "left" | "graduated";

export const OUTCOMES: readonly LearnerOutcome[] = ["up", "repeat", "left", "graduated"];

function byOrder(a: RolloverLevel, b: RolloverLevel): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { numeric: true });
}

/** The level after `levelId` in the school's order, or null for the final level. */
export function nextLevel(levels: readonly RolloverLevel[], levelId: string): RolloverLevel | null {
  const sorted = [...levels].sort(byOrder);
  const i = sorted.findIndex((l) => l.id === levelId);
  return i === -1 ? null : (sorted[i + 1] ?? null);
}

const levelNumber = (name: string) => /(\d+)\s*$/.exec(name)?.[1] ?? null;

/**
 * The name of the class a class moves up into: the level's number swapped at
 * the start of the name ("3 Blue" in Form 3 becomes "4 Blue" in Form 4, "5A"
 * in Grade 5 becomes "6A"), else the same name.
 */
export function proposeClassName(name: string, from: RolloverLevel, to: RolloverLevel): string {
  const a = levelNumber(from.name);
  const b = levelNumber(to.name);
  const trimmed = name.trim();
  if (a && b && trimmed.startsWith(a) && !/^\d/.test(trimmed.slice(a.length))) {
    return `${b}${trimmed.slice(a.length)}`;
  }
  return trimmed;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A class of the next year with this name at this level, else a new one. */
function classFor(
  name: string,
  gradeLevelId: string,
  nextClasses: readonly RolloverClass[],
): ClassTarget {
  const found = nextClasses.find((c) => sameName(c.name, name) && c.gradeLevelId === gradeLevelId);
  return found ? { kind: "existing", classId: found.id } : { kind: "new", name, gradeLevelId };
}

/**
 * Each class's proposed target: the next level's class with the proposed
 * name (an existing one of the next year, or a new one), or graduation for
 * the final level.
 */
export function proposeTarget(
  klass: RolloverClass,
  levels: readonly RolloverLevel[],
  nextClasses: readonly RolloverClass[],
): ClassTarget {
  const from = levels.find((l) => l.id === klass.gradeLevelId);
  const to = nextLevel(levels, klass.gradeLevelId);
  if (!from || !to) return { kind: "graduate" };
  return classFor(proposeClassName(klass.name, from, to), to.id, nextClasses);
}

/** Where a learner who repeats goes: the class of the same name and level next year. */
export function repeatTarget(
  klass: RolloverClass,
  nextClasses: readonly RolloverClass[],
): Exclude<ClassTarget, { kind: "graduate" | "skip" }> {
  return classFor(klass.name.trim(), klass.gradeLevelId, nextClasses) as Exclude<
    ClassTarget,
    { kind: "graduate" | "skip" }
  >;
}

export const defaultOutcome = (target: ClassTarget): LearnerOutcome =>
  target.kind === "graduate" ? "graduated" : "up";

/** A class target as a form value, and back. */
export function targetValue(target: ClassTarget): string {
  switch (target.kind) {
    case "existing":
      return `class:${target.classId}`;
    case "new":
      return "new";
    default:
      return target.kind;
  }
}

/**
 * Reads a target chosen on the form. "new" means the proposed new class, so
 * it is only valid when one was proposed; "class:<id>" must be a class of
 * the next year.
 */
export function parseTarget(
  value: unknown,
  proposed: ClassTarget,
  nextClasses: readonly RolloverClass[],
): ClassTarget | null {
  if (value === "graduate" || value === "skip") return { kind: value };
  if (value === "new") return proposed.kind === "new" ? proposed : null;
  if (typeof value === "string" && value.startsWith("class:")) {
    const id = value.slice("class:".length);
    return nextClasses.some((c) => c.id === id) ? { kind: "existing", classId: id } : null;
  }
  return null;
}

export type RolloverLearner = {
  enrolmentId: string;
  classId: string;
  name: string;
  outcome: LearnerOutcome;
};

export type RolloverPlan = {
  from_year_id: string;
  to_year_id: string;
  new_classes: {
    key: string;
    name: string;
    grade_level_id: string;
    copy_from_class_id: string;
  }[];
  learners: {
    enrolment_id: string;
    outcome: "promoted" | "repeating" | "left" | "graduated";
    to_class?: string;
  }[];
};

/**
 * The plan for roll_over_year(), or the problems that stop it. Learners of a
 * class marked "skip" are left out (they stay as they are). A new class is
 * made once per name, only when someone goes into it, as a copy of the old
 * class at the same level when there is one (its subjects and teachers),
 * else of the class moving up into it.
 */
export function buildPlan(input: {
  fromYearId: string;
  toYearId: string;
  classes: readonly RolloverClass[];
  targets: ReadonlyMap<string, ClassTarget>;
  nextClasses: readonly RolloverClass[];
  learners: readonly RolloverLearner[];
}): { ok: true; plan: RolloverPlan } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const fresh = new Map<
    string,
    { key: string; name: string; gradeLevelId: string; sources: RolloverClass[] }
  >();

  function classRef(target: ClassTarget, source: RolloverClass): string | null {
    if (target.kind === "existing") return target.classId;
    if (target.kind !== "new") return null;
    const clash = input.nextClasses.find((c) => sameName(c.name, target.name));
    if (clash) {
      problems.push(
        `A class called ${clash.name} already exists next year at another level. Choose it, or rename one of them in setup.`,
      );
      return null;
    }
    const id = target.name.trim().toLowerCase();
    let entry = fresh.get(id);
    if (!entry) {
      entry = {
        key: `n${fresh.size + 1}`,
        name: target.name.trim(),
        gradeLevelId: target.gradeLevelId,
        sources: [],
      };
      fresh.set(id, entry);
    } else if (entry.gradeLevelId !== target.gradeLevelId) {
      problems.push(`Two new classes would both be called ${entry.name}, at different levels.`);
      return null;
    }
    if (!entry.sources.some((s) => s.id === source.id)) entry.sources.push(source);
    return entry.key;
  }

  const learners: RolloverPlan["learners"] = [];
  for (const l of input.learners) {
    const klass = classById.get(l.classId);
    const target = input.targets.get(l.classId);
    if (!klass || !target) {
      problems.push(`${l.name}'s class is not in this year.`);
      continue;
    }
    if (target.kind === "skip") continue;
    switch (l.outcome) {
      case "up": {
        if (target.kind === "graduate") {
          problems.push(
            `${klass.name} graduates, so ${l.name} cannot move up. Choose another outcome.`,
          );
          break;
        }
        const ref = classRef(target, klass);
        if (ref) learners.push({ enrolment_id: l.enrolmentId, outcome: "promoted", to_class: ref });
        break;
      }
      case "repeat": {
        const ref = classRef(repeatTarget(klass, input.nextClasses), klass);
        if (ref)
          learners.push({ enrolment_id: l.enrolmentId, outcome: "repeating", to_class: ref });
        break;
      }
      case "left":
      case "graduated":
        learners.push({ enrolment_id: l.enrolmentId, outcome: l.outcome });
        break;
    }
  }
  if (problems.length) return { ok: false, problems: [...new Set(problems)] };
  if (learners.length === 0)
    return {
      ok: false,
      problems: ["Nobody is in the plan. Choose at least one class to roll over."],
    };

  return {
    ok: true,
    plan: {
      from_year_id: input.fromYearId,
      to_year_id: input.toYearId,
      new_classes: [...fresh.values()].map((c) => ({
        key: c.key,
        name: c.name,
        grade_level_id: c.gradeLevelId,
        copy_from_class_id: (
          c.sources.find((s) => s.gradeLevelId === c.gradeLevelId) ?? c.sources[0]!
        ).id,
      })),
      learners,
    },
  };
}

/** What the database reports back (preview or applied), read defensively. */
export type RolloverResult = {
  applied: boolean;
  promoted: number;
  repeating: number;
  left: number;
  graduated: number;
  classesCreated: string[];
  moves: {
    learnerName: string;
    learnerNumber: string;
    outcome: string;
    fromClass: string;
    toClass: string | null;
  }[];
  notCarried: {
    learnerId: string;
    learnerName: string;
    learnerNumber: string;
    subject: string;
    toClass: string;
  }[];
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];

export function readRolloverResult(raw: unknown): RolloverResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    applied: r.applied === true,
    promoted: num(r.promoted),
    repeating: num(r.repeating),
    left: num(r.left),
    graduated: num(r.graduated),
    classesCreated: list(r.classes_created).map((c) => str(c.name)),
    moves: list(r.enrolments).map((m) => ({
      learnerName: str(m.learner_name),
      learnerNumber: str(m.learner_number),
      outcome: str(m.outcome),
      fromClass: str(m.from_class),
      toClass: typeof m.to_class === "string" ? m.to_class : null,
    })),
    notCarried: list(r.not_carried).map((n) => ({
      learnerId: str(n.learner_id),
      learnerName: str(n.learner_name),
      learnerNumber: str(n.learner_number),
      subject: str(n.subject),
      toClass: str(n.to_class),
    })),
  };
}
