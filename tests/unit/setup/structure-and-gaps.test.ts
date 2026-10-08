import { describe, expect, it } from "vitest";
import { describeGap, findSetupGaps, type SetupSnapshot } from "@/lib/setup/gaps";
import {
  parseClass,
  parseGradeLevel,
  parseOptionalTeacher,
  parseSubject,
} from "@/lib/setup/structure";

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("parseGradeLevel", () => {
  it("accepts a level with its scale", () => {
    expect(
      parseGradeLevel({
        name: " Form 1 ",
        stage: "o_level",
        sortOrder: "1",
        gradingScaleId: ID(1),
      }),
    ).toEqual({
      ok: true,
      value: { name: "Form 1", stage: "o_level", sortOrder: 1, gradingScaleId: ID(1) },
    });
  });

  it("rejects a missing scale and a bad order", () => {
    expect(
      parseGradeLevel({ name: "Form 1", stage: "o_level", sortOrder: "-2", gradingScaleId: "" }),
    ).toMatchObject({
      ok: false,
      errors: { sortOrder: expect.any(String), gradingScaleId: expect.any(String) },
    });
  });
});

describe("parseSubject", () => {
  it("upper-cases the code and reads the core checkbox", () => {
    expect(
      parseSubject({
        code: "math",
        name: "Mathematics",
        stageScope: "secondary",
        isCore: "on",
        sortOrder: "",
      }),
    ).toEqual({
      ok: true,
      value: {
        code: "MATH",
        name: "Mathematics",
        stageScope: "secondary",
        isCore: true,
        sortOrder: 0,
      },
    });
  });

  it("rejects a code with spaces", () => {
    expect(
      parseSubject({
        code: "F N",
        name: "Food",
        stageScope: "secondary",
        isCore: null,
        sortOrder: "",
      }),
    ).toMatchObject({ ok: false, errors: { code: expect.any(String) } });
  });
});

describe("parseClass", () => {
  it("allows a class with no class teacher yet", () => {
    expect(parseClass({ name: "3 Blue", gradeLevelId: ID(2), classTeacherId: "" })).toEqual({
      ok: true,
      value: { name: "3 Blue", gradeLevelId: ID(2), classTeacherId: null },
    });
  });

  it("rejects a teacher that is not an id", () => {
    expect(
      parseClass({ name: "3 Blue", gradeLevelId: ID(2), classTeacherId: "Mr Moyo" }),
    ).toMatchObject({ ok: false, errors: { classTeacherId: expect.any(String) } });
  });
});

describe("parseOptionalTeacher", () => {
  it("reads empty as no teacher yet", () => {
    expect(parseOptionalTeacher("")).toEqual({ ok: true, value: null });
    expect(parseOptionalTeacher(ID(3))).toEqual({ ok: true, value: ID(3) });
    expect(parseOptionalTeacher("x")).toEqual({ ok: false });
  });
});

describe("findSetupGaps", () => {
  const complete: SetupSnapshot = {
    terms: [{ id: ID(1) }],
    gradeLevels: [
      { id: ID(2), name: "Form 3", scaleComplete: true },
      { id: ID(7), name: "Form 4", scaleComplete: true },
    ],
    // One teacher (ID 9) is class teacher of two classes in different grades
    // and teaches subjects in both.
    classes: [
      { id: ID(3), name: "3 Blue", classTeacherId: ID(9), gradeLevelId: ID(2) },
      { id: ID(4), name: "4 Green", classTeacherId: ID(9), gradeLevelId: ID(7) },
    ],
    classSubjects: [
      { id: ID(5), classId: ID(3), subjectName: "Maths", teacherId: ID(9) },
      { id: ID(6), classId: ID(4), subjectName: "Maths", teacherId: ID(9) },
      { id: ID(8), classId: ID(4), subjectName: "Science", teacherId: ID(9) },
    ],
  };

  it("finds nothing when every class and class subject has a teacher", () => {
    expect(findSetupGaps(complete)).toEqual([]);
  });

  it("lists classes without a class teacher and class subjects without a teacher", () => {
    const gaps = findSetupGaps({
      ...complete,
      classes: [{ ...complete.classes[0]!, classTeacherId: null }, complete.classes[1]!],
      classSubjects: [
        complete.classSubjects[0]!,
        { ...complete.classSubjects[1]!, teacherId: null },
        complete.classSubjects[2]!,
      ],
    });
    expect(gaps.map(describeGap)).toEqual([
      "3 Blue has no class teacher.",
      "Maths in 4 Green has no teacher.",
    ]);
  });

  it("lists an empty year, a class with no subjects and an incomplete scale in use", () => {
    expect(
      findSetupGaps({ terms: [], classes: [], classSubjects: [], gradeLevels: [] }).map(
        (g) => g.kind,
      ),
    ).toEqual(["no-terms", "no-classes"]);
    expect(
      findSetupGaps({
        ...complete,
        classSubjects: [complete.classSubjects[0]!],
        gradeLevels: [
          { id: ID(2), name: "Form 3", scaleComplete: false },
          { id: ID(7), name: "Form 4", scaleComplete: true },
        ],
      }).map(describeGap),
    ).toEqual([
      "4 Green has no subjects.",
      "Form 3 uses a grading scale that does not cover 0 to 100 exactly.",
    ]);
  });
});
