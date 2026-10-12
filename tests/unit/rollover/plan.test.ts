import { describe, expect, it } from "vitest";
import {
  buildPlan,
  defaultOutcome,
  nextLevel,
  parseTarget,
  proposeClassName,
  proposeTarget,
  readRolloverResult,
  repeatTarget,
  targetValue,
  type ClassTarget,
  type RolloverClass,
  type RolloverLearner,
} from "@/lib/rollover/plan";

const form3 = { id: "f3", name: "Form 3", sortOrder: 3 };
const form4 = { id: "f4", name: "Form 4", sortOrder: 4 };
const grade5 = { id: "g5", name: "Grade 5", sortOrder: 5 };
const grade6 = { id: "g6", name: "Grade 6", sortOrder: 6 };
const levels = [form4, form3];

const blue3 = { id: "c-3b", name: "3 Blue", gradeLevelId: "f3" };
const green3 = { id: "c-3g", name: "3 Green", gradeLevelId: "f3" };
const blue4 = { id: "c-4b", name: "4 Blue", gradeLevelId: "f4" };
const classes = [blue3, green3, blue4];

describe("nextLevel", () => {
  it("is the next level in the school's order, whatever order they are listed in", () => {
    expect(nextLevel(levels, "f3")).toEqual(form4);
  });
  it("is null for the final level and an unknown one", () => {
    expect(nextLevel(levels, "f4")).toBeNull();
    expect(nextLevel(levels, "nope")).toBeNull();
  });
  it("orders equal sort orders by name, numbers as numbers", () => {
    const flat = [
      { id: "a", name: "Grade 10", sortOrder: 0 },
      { id: "b", name: "Grade 9", sortOrder: 0 },
    ];
    expect(nextLevel(flat, "b")?.id).toBe("a");
  });
});

describe("proposeClassName", () => {
  it("swaps the level number at the start of the name", () => {
    expect(proposeClassName("3 Blue", form3, form4)).toBe("4 Blue");
    expect(proposeClassName("5A", grade5, grade6)).toBe("6A");
  });
  it("keeps a name that does not start with the level's number", () => {
    expect(proposeClassName("Blue", form3, form4)).toBe("Blue");
    expect(proposeClassName("Kingfishers", grade5, grade6)).toBe("Kingfishers");
  });
  it("does not take a longer number for the level's", () => {
    const form1 = { id: "f1", name: "Form 1", sortOrder: 1 };
    const form2 = { id: "f2", name: "Form 2", sortOrder: 2 };
    expect(proposeClassName("13 Red", form1, form2)).toBe("13 Red");
  });
  it("keeps the name when a level has no number", () => {
    expect(proposeClassName("3 Blue", form3, { id: "l6", name: "Lower Sixth", sortOrder: 5 })).toBe(
      "3 Blue",
    );
  });
});

describe("proposeTarget and repeatTarget", () => {
  it("proposes a new class at the next level when next year has none by that name", () => {
    expect(proposeTarget(blue3, levels, [])).toEqual({
      kind: "new",
      name: "4 Blue",
      gradeLevelId: "f4",
    });
  });
  it("uses next year's class of that name and level when it exists", () => {
    const next = [{ id: "n-4b", name: "4 blue", gradeLevelId: "f4" }];
    expect(proposeTarget(blue3, levels, next)).toEqual({ kind: "existing", classId: "n-4b" });
  });
  it("graduates the final level", () => {
    expect(proposeTarget(blue4, levels, [])).toEqual({ kind: "graduate" });
    expect(defaultOutcome({ kind: "graduate" })).toBe("graduated");
    expect(defaultOutcome({ kind: "new", name: "4 Blue", gradeLevelId: "f4" })).toBe("up");
  });
  it("sends a repeater to the class of the same name and level", () => {
    expect(repeatTarget(blue3, [])).toEqual({ kind: "new", name: "3 Blue", gradeLevelId: "f3" });
    expect(repeatTarget(blue3, [{ id: "n-3b", name: "3 Blue", gradeLevelId: "f3" }])).toEqual({
      kind: "existing",
      classId: "n-3b",
    });
  });
});

describe("targetValue and parseTarget", () => {
  const next: RolloverClass[] = [{ id: "n-4g", name: "4 Green", gradeLevelId: "f4" }];
  const proposed: ClassTarget = { kind: "new", name: "4 Blue", gradeLevelId: "f4" };
  it("round-trips each kind", () => {
    for (const t of [
      proposed,
      { kind: "existing", classId: "n-4g" },
      { kind: "graduate" },
      { kind: "skip" },
    ] as ClassTarget[])
      expect(parseTarget(targetValue(t), proposed, next)).toEqual(t);
  });
  it("refuses a class that is not next year's and a new class nobody proposed", () => {
    expect(parseTarget("class:c-3b", proposed, next)).toBeNull();
    expect(parseTarget("new", { kind: "graduate" }, next)).toBeNull();
    expect(parseTarget(42, proposed, next)).toBeNull();
  });
});

describe("buildPlan", () => {
  const learner = (id: string, classId: string, outcome: RolloverLearner["outcome"]) => ({
    enrolmentId: `e-${id}`,
    classId,
    name: `Learner ${id}`,
    outcome,
  });
  const targets = new Map<string, ClassTarget>([
    [blue3.id, { kind: "new", name: "4 Blue", gradeLevelId: "f4" }],
    [green3.id, { kind: "existing", classId: "n-4g" }],
    [blue4.id, { kind: "graduate" }],
  ]);
  const nextClasses = [{ id: "n-4g", name: "4 Green", gradeLevelId: "f4" }];
  const base = { fromYearId: "y26", toYearId: "y27", classes, targets, nextClasses };

  it("maps each outcome, making each new class once", () => {
    const result = buildPlan({
      ...base,
      learners: [
        learner("1", blue3.id, "up"),
        learner("2", blue3.id, "up"),
        learner("3", blue3.id, "repeat"),
        learner("4", green3.id, "up"),
        learner("5", green3.id, "left"),
        learner("6", blue4.id, "graduated"),
      ],
    });
    expect(result).toEqual({
      ok: true,
      plan: {
        from_year_id: "y26",
        to_year_id: "y27",
        new_classes: [
          { key: "n1", name: "4 Blue", grade_level_id: "f4", copy_from_class_id: "c-3b" },
          { key: "n2", name: "3 Blue", grade_level_id: "f3", copy_from_class_id: "c-3b" },
        ],
        learners: [
          { enrolment_id: "e-1", outcome: "promoted", to_class: "n1" },
          { enrolment_id: "e-2", outcome: "promoted", to_class: "n1" },
          { enrolment_id: "e-3", outcome: "repeating", to_class: "n2" },
          { enrolment_id: "e-4", outcome: "promoted", to_class: "n-4g" },
          { enrolment_id: "e-5", outcome: "left" },
          { enrolment_id: "e-6", outcome: "graduated" },
        ],
      },
    });
  });

  it("copies a shared new class from the old class at its own level", () => {
    // 3 Blue moves up into a new 4 Blue and a 4 Blue learner repeats in it.
    const result = buildPlan({
      ...base,
      learners: [learner("1", blue3.id, "up"), learner("2", blue4.id, "repeat")],
    });
    expect(result.ok && result.plan.new_classes).toEqual([
      { key: "n1", name: "4 Blue", grade_level_id: "f4", copy_from_class_id: "c-4b" },
    ]);
  });

  it("makes no class nobody goes into", () => {
    const result = buildPlan({ ...base, learners: [learner("1", blue3.id, "left")] });
    expect(result.ok && result.plan.new_classes).toEqual([]);
  });

  it("leaves out a class marked not now", () => {
    const skip = new Map(targets).set(green3.id, { kind: "skip" });
    const result = buildPlan({
      ...base,
      targets: skip,
      learners: [learner("1", blue3.id, "left"), learner("4", green3.id, "up")],
    });
    expect(result.ok && result.plan.learners.map((l) => l.enrolment_id)).toEqual(["e-1"]);
  });

  it("refuses moving up from a graduating class, by name", () => {
    expect(buildPlan({ ...base, learners: [learner("6", blue4.id, "up")] })).toEqual({
      ok: false,
      problems: ["4 Blue graduates, so Learner 6 cannot move up. Choose another outcome."],
    });
  });

  it("refuses a new class whose name is taken at another level", () => {
    const taken = [...nextClasses, { id: "n-x", name: "4 Blue", gradeLevelId: "f3" }];
    const result = buildPlan({
      ...base,
      nextClasses: taken,
      learners: [learner("1", blue3.id, "up")],
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        "A class called 4 Blue already exists next year at another level. Choose it, or rename one of them in setup.",
      ],
    });
  });

  it("refuses an empty plan and a learner from another year", () => {
    expect(buildPlan({ ...base, learners: [] }).ok).toBe(false);
    expect(buildPlan({ ...base, learners: [learner("9", "elsewhere", "left")] })).toEqual({
      ok: false,
      problems: ["Learner 9's class is not in this year."],
    });
  });
});

describe("readRolloverResult", () => {
  it("reads the database's answer and survives a missing one", () => {
    expect(
      readRolloverResult({
        applied: true,
        promoted: 2,
        repeating: 1,
        left: 0,
        graduated: 3,
        classes_created: [{ id: "x", name: "4 Blue" }],
        enrolments: [
          {
            learner_name: "Lungi Moyo",
            learner_number: "R-01",
            outcome: "promoted",
            from_class: "3 Blue",
            to_class: "4 Blue",
          },
        ],
        not_carried: [
          {
            learner_id: "l1",
            learner_name: "Sipho Dube",
            learner_number: "R-03",
            subject: "Art",
            to_class: "4 Green",
          },
        ],
      }),
    ).toEqual({
      applied: true,
      promoted: 2,
      repeating: 1,
      left: 0,
      graduated: 3,
      classesCreated: ["4 Blue"],
      moves: [
        {
          learnerName: "Lungi Moyo",
          learnerNumber: "R-01",
          outcome: "promoted",
          fromClass: "3 Blue",
          toClass: "4 Blue",
        },
      ],
      notCarried: [
        {
          learnerId: "l1",
          learnerName: "Sipho Dube",
          learnerNumber: "R-03",
          subject: "Art",
          toClass: "4 Green",
        },
      ],
    });
    expect(readRolloverResult(null)).toMatchObject({ applied: false, promoted: 0, moves: [] });
  });
});
