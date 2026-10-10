/**
 * Completion tracking (US-4.8, D36): what is still missing for a term, per
 * class and per teacher. Pure: the caller passes the rows of
 * public.completion_class_subjects() and public.completion_classes().
 */

export type ClassSubjectCompletion = {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
  learners: number;
  assessments: number;
  totalWeight: number;
  marksMissing: number;
  commentsMissing: number;
};

export type ClassCompletion = {
  classId: string;
  className: string;
  classTeacherId: string | null;
  classTeacherName: string | null;
  learners: number;
  /** Null in a vacation term, which has no class comments. */
  classCommentsMissing: number | null;
};

export type CompletionTotals = {
  marksMissing: number;
  commentsMissing: number;
  classCommentsMissing: number;
  weightProblems: number;
};

export type CompletionGroup = {
  key: string;
  name: string;
  totals: CompletionTotals;
  classSubjects: ClassSubjectCompletion[];
  classes: ClassCompletion[];
};

/** Weights that do not add to exactly 100 (none at all counts too). */
export const weightsWrong = (cs: ClassSubjectCompletion) => cs.totalWeight !== 100;

export function isComplete(t: CompletionTotals): boolean {
  return (
    t.marksMissing === 0 &&
    t.commentsMissing === 0 &&
    t.classCommentsMissing === 0 &&
    t.weightProblems === 0
  );
}

function totalsOf(
  subjects: ClassSubjectCompletion[],
  classes: ClassCompletion[],
): CompletionTotals {
  return {
    marksMissing: subjects.reduce((n, cs) => n + cs.marksMissing, 0),
    commentsMissing: subjects.reduce((n, cs) => n + cs.commentsMissing, 0),
    classCommentsMissing: classes.reduce((n, c) => n + (c.classCommentsMissing ?? 0), 0),
    weightProblems: subjects.filter(weightsWrong).length,
  };
}

export function overallTotals(
  subjects: ClassSubjectCompletion[],
  classes: ClassCompletion[],
): CompletionTotals {
  return totalsOf(subjects, classes);
}

/** By class: each class's subjects and its own class comments, in class order. */
export function byClass(
  subjects: ClassSubjectCompletion[],
  classes: ClassCompletion[],
): CompletionGroup[] {
  const groups = new Map<string, CompletionGroup>();
  const group = (id: string, name: string) => {
    let g = groups.get(id);
    if (!g) {
      g = { key: id, name, totals: totalsOf([], []), classSubjects: [], classes: [] };
      groups.set(id, g);
    }
    return g;
  };
  for (const c of classes) group(c.classId, c.className).classes.push(c);
  for (const cs of subjects) group(cs.classId, cs.className).classSubjects.push(cs);
  return finish([...groups.values()]);
}

/**
 * By teacher: the class subjects each teaches and the classes they are
 * class teacher of. Class subjects with no teacher come last, as "No teacher".
 */
export function byTeacher(
  subjects: ClassSubjectCompletion[],
  classes: ClassCompletion[],
): CompletionGroup[] {
  const groups = new Map<string, CompletionGroup>();
  const group = (id: string | null, name: string | null) => {
    const key = id ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: id ? (name ?? "Unnamed teacher") : "No teacher",
        totals: totalsOf([], []),
        classSubjects: [],
        classes: [],
      };
      groups.set(key, g);
    }
    return g;
  };
  for (const cs of subjects) group(cs.teacherId, cs.teacherName).classSubjects.push(cs);
  for (const c of classes) group(c.classTeacherId, c.classTeacherName).classes.push(c);
  const all = finish([...groups.values()]);
  return [...all.filter((g) => g.key !== "none"), ...all.filter((g) => g.key === "none")];
}

function finish(groups: CompletionGroup[]): CompletionGroup[] {
  for (const g of groups) g.totals = totalsOf(g.classSubjects, g.classes);
  return groups.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

/** "3 marks", "1 mark". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
