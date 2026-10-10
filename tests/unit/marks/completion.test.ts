import { describe, expect, it } from "vitest";
import {
  byClass,
  byTeacher,
  count,
  isComplete,
  overallTotals,
  type ClassCompletion,
  type ClassSubjectCompletion,
} from "@/lib/marks/completion";

const cs = (over: Partial<ClassSubjectCompletion>): ClassSubjectCompletion => ({
  classSubjectId: "cs",
  classId: "blue",
  className: "4 Blue",
  subjectName: "Maths",
  teacherId: "moyo",
  teacherName: "Mr Moyo",
  learners: 3,
  assessments: 3,
  totalWeight: 100,
  marksMissing: 0,
  commentsMissing: 0,
  ...over,
});

const klass = (over: Partial<ClassCompletion>): ClassCompletion => ({
  classId: "blue",
  className: "4 Blue",
  classTeacherId: "moyo",
  classTeacherName: "Mr Moyo",
  learners: 3,
  classCommentsMissing: 0,
  ...over,
});

const subjects = [
  cs({ classSubjectId: "m", marksMissing: 4, commentsMissing: 3 }),
  cs({
    classSubjectId: "e",
    subjectName: "English",
    teacherId: "dube",
    teacherName: "Mrs Dube",
    totalWeight: 80,
    commentsMissing: 1,
  }),
  cs({
    classSubjectId: "g",
    classId: "green",
    className: "10 Green",
    teacherId: null,
    teacherName: null,
    assessments: 0,
    totalWeight: 0,
  }),
];
const classes = [
  klass({ classCommentsMissing: 2 }),
  klass({
    classId: "green",
    className: "10 Green",
    classTeacherId: "dube",
    classTeacherName: "Mrs Dube",
    classCommentsMissing: null,
  }),
];

describe("completion totals", () => {
  it("adds up what is missing; weights that are not 100 count, none at all too", () => {
    expect(overallTotals(subjects, classes)).toEqual({
      marksMissing: 4,
      commentsMissing: 4,
      classCommentsMissing: 2,
      weightProblems: 2,
    });
  });

  it("is complete only when nothing is missing", () => {
    expect(isComplete(overallTotals([cs({})], [klass({})]))).toBe(true);
    expect(isComplete(overallTotals([cs({ totalWeight: 99.5 })], []))).toBe(false);
    // A vacation term's classes have no class comments to miss.
    expect(isComplete(overallTotals([], [klass({ classCommentsMissing: null })]))).toBe(true);
  });
});

describe("byClass", () => {
  it("groups class subjects with their class, in natural class order", () => {
    const groups = byClass(subjects, classes);
    expect(groups.map((g) => g.name)).toEqual(["4 Blue", "10 Green"]);
    expect(groups[0]!.classSubjects.map((c) => c.classSubjectId)).toEqual(["m", "e"]);
    expect(groups[0]!.totals).toEqual({
      marksMissing: 4,
      commentsMissing: 4,
      classCommentsMissing: 2,
      weightProblems: 1,
    });
  });
});

describe("byTeacher", () => {
  it("groups by subject teacher and class teacher, with no-teacher last", () => {
    const groups = byTeacher(subjects, classes);
    expect(groups.map((g) => g.name)).toEqual(["Mr Moyo", "Mrs Dube", "No teacher"]);
    const dube = groups[1]!;
    expect(dube.classSubjects.map((c) => c.classSubjectId)).toEqual(["e"]);
    expect(dube.classes.map((c) => c.classId)).toEqual(["green"]);
    expect(dube.totals.weightProblems).toBe(1);
    expect(groups[0]!.totals.classCommentsMissing).toBe(2);
  });
});

it("counts in words", () => {
  expect(count(1, "mark")).toBe("1 mark");
  expect(count(0, "comment")).toBe("0 comments");
  expect(count(2, "class comment")).toBe("2 class comments");
});
