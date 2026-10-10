/**
 * Grading band checks for the band editor (SPEC US-2.3, D21). Pure; mirrors
 * `public.grading_scale_problems()` so the editor can say exactly what is
 * wrong before saving, and the database refuses the same things.
 *
 * Bands are whole marks, both ends included (Q1).
 */

export type BandInput = {
  grade: string;
  minMark: string | number;
  maxMark: string | number;
  remark?: string | null;
};

export type Band = { grade: string; minMark: number; maxMark: number; remark: string | null };

export type BandProblem =
  | { kind: "gap"; from: number; to: number }
  | { kind: "overlap"; from: number; to: number; grades: string[] }
  | { kind: "out-of-range"; row: number; grade: string }
  | { kind: "reversed"; row: number; grade: string }
  | { kind: "not-whole"; row: number; grade: string }
  | { kind: "missing-grade"; row: number }
  | { kind: "duplicate-grade"; grade: string }
  | { kind: "too-long"; row: number; grade: string }
  | { kind: "empty" };

/** O-level key from the sample report (docs/GRADING_AND_WEIGHTS.md section 1). */
export const O_LEVEL_BANDS: readonly Band[] = [
  { grade: "A", minMark: 70, maxMark: 100, remark: null },
  { grade: "B", minMark: 60, maxMark: 69, remark: null },
  { grade: "C", minMark: 50, maxMark: 59, remark: null },
  { grade: "D", minMark: 45, maxMark: 49, remark: null },
  { grade: "E", minMark: 40, maxMark: 44, remark: null },
  { grade: "U", minMark: 0, maxMark: 39, remark: null },
];

/** Placeholder primary key (docs/GRADING_AND_WEIGHTS.md section 2, to confirm, Q2). */
export const PRIMARY_BANDS: readonly Band[] = [
  { grade: "A", minMark: 80, maxMark: 100, remark: "Excellent" },
  { grade: "B", minMark: 70, maxMark: 79, remark: "Very good" },
  { grade: "C", minMark: 60, maxMark: 69, remark: "Good" },
  { grade: "D", minMark: 50, maxMark: 59, remark: "Satisfactory" },
  { grade: "E", minMark: 40, maxMark: 49, remark: "Needs improvement" },
  { grade: "U", minMark: 0, maxMark: 39, remark: "Not yet achieved" },
];

export const SCALE_TEMPLATES = {
  o_level: { name: "O-Level", stage: "o_level", bands: O_LEVEL_BANDS },
  primary: { name: "Primary", stage: "primary", bands: PRIMARY_BANDS },
} as const;
export type ScaleTemplate = keyof typeof SCALE_TEMPLATES;

function toWhole(value: string | number): number | null {
  const n = typeof value === "number" ? value : value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Runs of consecutive marks, e.g. [40, 41, 42, 45] to [[40, 42], [45, 45]]. */
function runs(marks: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const m of marks) {
    const last = out[out.length - 1];
    if (last && last[1] === m - 1) last[1] = m;
    else out.push([m, m]);
  }
  return out;
}

/**
 * Every problem with a set of bands, row problems first, then gaps and
 * overlaps in mark order. An empty list means the bands cover 0 to 100
 * exactly once and can be saved, including on a default scale.
 */
export function checkBands(rows: readonly BandInput[]): BandProblem[] {
  if (rows.length === 0) return [{ kind: "empty" }];
  const problems: BandProblem[] = [];
  const usable: { grade: string; min: number; max: number }[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const grade = row.grade.trim();
    const n = i + 1;
    if (!grade) problems.push({ kind: "missing-grade", row: n });
    else if (grade.length > 10) problems.push({ kind: "too-long", row: n, grade });
    else seen.set(grade.toUpperCase(), (seen.get(grade.toUpperCase()) ?? 0) + 1);

    const min = toWhole(row.minMark);
    const max = toWhole(row.maxMark);
    const label = grade || `row ${n}`;
    if (min === null || max === null) {
      problems.push({ kind: "not-whole", row: n, grade: label });
      return;
    }
    if (min < 0 || max > 100 || min > 100 || max < 0) {
      problems.push({ kind: "out-of-range", row: n, grade: label });
      return;
    }
    if (min > max) {
      problems.push({ kind: "reversed", row: n, grade: label });
      return;
    }
    usable.push({ grade: label, min, max });
  });

  for (const [grade, count] of seen) {
    if (count > 1) problems.push({ kind: "duplicate-grade", grade });
  }

  // Only judge coverage once every row is a valid range; otherwise a typo
  // would show up twice (as a row problem and as a gap).
  if (problems.length) return problems;

  const gaps: number[] = [];
  const overlaps = new Map<number, string[]>();
  for (let mark = 0; mark <= 100; mark++) {
    const hits = usable.filter((b) => mark >= b.min && mark <= b.max).map((b) => b.grade);
    if (hits.length === 0) gaps.push(mark);
    if (hits.length > 1) overlaps.set(mark, hits);
  }

  const coverage: BandProblem[] = [
    ...runs(gaps).map(([from, to]) => ({ kind: "gap" as const, from, to })),
    ...runs([...overlaps.keys()]).map(([from, to]) => ({
      kind: "overlap" as const,
      from,
      to,
      grades: overlaps.get(from)!,
    })),
  ];
  return coverage.sort((a, b) => ("from" in a && "from" in b ? a.from - b.from : 0));
}

function marks(from: number, to: number): string {
  return from === to ? `mark ${from}` : `marks ${from} to ${to}`;
}

/** One plain sentence per problem, for the editor and form errors. */
export function describeBandProblem(p: BandProblem): string {
  switch (p.kind) {
    case "gap":
      return `Gap: ${marks(p.from, p.to)} ${p.from === p.to ? "is" : "are"} in no band.`;
    case "overlap":
      return `Overlap: ${marks(p.from, p.to)} ${p.from === p.to ? "is" : "are"} in more than one band (${p.grades.join(" and ")}).`;
    case "out-of-range":
      return `Out of range: ${p.grade} (row ${p.row}) must stay between 0 and 100.`;
    case "reversed":
      return `${p.grade} (row ${p.row}): the lowest mark is above the highest mark.`;
    case "not-whole":
      return `${p.grade} (row ${p.row}): enter whole marks from 0 to 100.`;
    case "missing-grade":
      return `Row ${p.row} needs a grade.`;
    case "too-long":
      return `${p.grade} (row ${p.row}): a grade is at most 10 characters.`;
    case "duplicate-grade":
      return `Grade ${p.grade} is used more than once.`;
    case "empty":
      return "Add at least one band covering 0 to 100.";
  }
}

/** Valid rows as numbers, highest band first, or the problems if any. */
export function parseBands(
  rows: readonly BandInput[],
): { ok: true; value: Band[] } | { ok: false; problems: BandProblem[] } {
  const problems = checkBands(rows);
  if (problems.length) return { ok: false, problems };
  const value = rows
    .map((r) => ({
      grade: r.grade.trim(),
      minMark: Number(r.minMark),
      maxMark: Number(r.maxMark),
      remark: r.remark?.trim().slice(0, 120) || null,
    }))
    .sort((a, b) => b.minMark - a.minMark);
  return { ok: true, value };
}

/**
 * The grade for a whole mark, or null if no band covers it. Where bands
 * overlap (only a default scale must not, D21) the highest band wins, as in
 * the database (D37), whatever order the bands were loaded in.
 */
export function gradeFor(bands: readonly Band[], mark: number): string | null {
  let best: Band | undefined;
  for (const b of bands) {
    if (mark < b.minMark || mark > b.maxMark) continue;
    if (
      !best ||
      b.minMark > best.minMark ||
      (b.minMark === best.minMark && b.maxMark > best.maxMark)
    )
      best = b;
  }
  return best?.grade ?? null;
}
