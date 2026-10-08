/**
 * What still blocks finishing a year's setup (SPEC US-2.1). Pure. The
 * blocking gaps match `public.academic_year_setup_gaps()`, which the
 * database checks again when the admin finishes (D22).
 */

export type SetupSnapshot = {
  terms: readonly { id: string }[];
  classes: readonly {
    id: string;
    name: string;
    classTeacherId: string | null;
    gradeLevelId: string;
  }[];
  classSubjects: readonly {
    id: string;
    classId: string;
    subjectName: string;
    teacherId: string | null;
  }[];
  gradeLevels: readonly { id: string; name: string; scaleComplete: boolean }[];
};

export type SetupGap =
  | { kind: "no-terms" }
  | { kind: "no-classes" }
  | { kind: "no-class-teacher"; classId: string; className: string }
  | { kind: "no-subjects"; classId: string; className: string }
  | { kind: "no-subject-teacher"; classId: string; className: string; subjectName: string }
  | { kind: "incomplete-scale"; gradeLevelName: string };

/**
 * Every gap, classes in name order. Blocking gaps stop the admin finishing;
 * the database enforces the two teacher gaps.
 */
export function findSetupGaps(s: SetupSnapshot): SetupGap[] {
  const gaps: SetupGap[] = [];
  if (s.terms.length === 0) gaps.push({ kind: "no-terms" });
  if (s.classes.length === 0) gaps.push({ kind: "no-classes" });

  const byName = [...s.classes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  for (const c of byName) {
    if (!c.classTeacherId)
      gaps.push({ kind: "no-class-teacher", classId: c.id, className: c.name });
    const subjects = s.classSubjects
      .filter((cs) => cs.classId === c.id)
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    if (subjects.length === 0) gaps.push({ kind: "no-subjects", classId: c.id, className: c.name });
    for (const cs of subjects) {
      if (!cs.teacherId)
        gaps.push({
          kind: "no-subject-teacher",
          classId: c.id,
          className: c.name,
          subjectName: cs.subjectName,
        });
    }
  }

  const usedLevels = new Set(s.classes.map((c) => c.gradeLevelId));
  for (const level of s.gradeLevels) {
    if (usedLevels.has(level.id) && !level.scaleComplete)
      gaps.push({ kind: "incomplete-scale", gradeLevelName: level.name });
  }
  return gaps;
}

export function describeGap(g: SetupGap): string {
  switch (g.kind) {
    case "no-terms":
      return "The year has no terms yet.";
    case "no-classes":
      return "The year has no classes yet.";
    case "no-class-teacher":
      return `${g.className} has no class teacher.`;
    case "no-subjects":
      return `${g.className} has no subjects.`;
    case "no-subject-teacher":
      return `${g.subjectName} in ${g.className} has no teacher.`;
    case "incomplete-scale":
      return `${g.gradeLevelName} uses a grading scale that does not cover 0 to 100 exactly.`;
  }
}
