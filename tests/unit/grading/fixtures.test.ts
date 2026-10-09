/**
 * The TypeScript calculations reproduce seed/expected_subject_results.csv
 * and seed/expected_class_positions.csv exactly, from the seed marks. The
 * database is held to the same rows by supabase/tests/16_grade_fixtures,
 * which is generated from the same CSVs; the last test here proves that
 * file is up to date, so TypeScript and SQL agree on every fixture row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixtureTest, FIXTURE_TEST_PATH } from "../../../scripts/grade-fixture-test.mjs";
import {
  classPositions,
  subjectResult,
  type AssessmentWithMark,
  type MarkStatus,
} from "@/lib/grading/results";
import { parseCsv } from "@/lib/people/csv";
import type { Band } from "@/lib/setup/bands";

const root = path.resolve(__dirname, "../../..");

function table(name: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(path.join(root, "seed", `${name}.csv`), "utf8"));
  return rows
    .filter((r) => r.some((cell) => cell !== ""))
    .map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ""])));
}

const groupBy = <T>(rows: T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};

function computeFromSeed() {
  const bandsByScale = groupBy(table("grading_bands"), (b) => b.scale_id!);
  const levels = new Map(table("grade_levels").map((l) => [l.id!, l]));
  const terms = table("terms");
  const subjects = new Map(table("subjects").map((s) => [s.id!, s]));
  const classSubjects = groupBy(table("class_subjects"), (cs) => cs.class_id!);
  const enrolments = groupBy(table("enrolments"), (e) => e.class_id!);
  const learners = new Map(table("learners").map((l) => [l.id!, l]));
  const choices = new Set(
    table("enrolment_subjects").map((es) => `${es.enrolment_id}|${es.class_subject_id}`),
  );
  const assessments = groupBy(table("assessments"), (a) => `${a.term_id}|${a.class_subject_id}`);
  const marks = new Map(table("marks").map((m) => [`${m.assessment_id}|${m.enrolment_id}`, m]));

  const results: string[][] = [];
  const positions: string[][] = [];

  for (const cls of table("classes")) {
    const bands: Band[] = (
      bandsByScale.get(levels.get(cls.grade_level_id!)!.grading_scale_id!) ?? []
    ).map((b) => ({
      grade: b.grade!,
      minMark: Number(b.min_mark),
      maxMark: Number(b.max_mark),
      remark: b.remark || null,
    }));
    for (const term of terms.filter((t) => t.academic_year_id === cls.academic_year_id)) {
      const classEnrolments = enrolments.get(cls.id!) ?? [];
      const completed = new Map<string, number[]>(classEnrolments.map((e) => [e.id!, []]));
      let anyResult = false;

      for (const cs of classSubjects.get(cls.id!) ?? []) {
        const termAssessments = assessments.get(`${term.id}|${cs.id}`) ?? [];
        for (const e of classEnrolments) {
          if (!choices.has(`${e.id}|${cs.id}`)) continue;
          const input: AssessmentWithMark[] = termAssessments.map((a) => {
            const m = marks.get(`${a.id}|${e.id}`);
            return {
              maxMark: a.max_mark!,
              weightPercent: a.weight_percent!,
              mark: m ? { status: m.status as MarkStatus, score: m.score || null } : null,
            };
          });
          const result = subjectResult(input, bands);
          if (!result) continue;
          anyResult = true;
          const base = [
            term.id!,
            cls.id!,
            e.id!,
            learners.get(e.learner_id!)!.learner_number!,
            cs.id!,
          ];
          const code = subjects.get(cs.subject_id!)!.code!;
          if (result.status === "complete") {
            completed.get(e.id!)!.push(result.roundedMark);
            results.push([
              ...base,
              code,
              result.weightedPercent.toFixed(2),
              String(result.roundedMark),
              result.grade ?? "",
              "complete",
            ]);
          } else {
            results.push([...base, code, "", "", "", "incomplete"]);
          }
        }
      }

      if (!anyResult || term.kind === "vacation") continue;
      const ranked = classPositions(
        classEnrolments.map((e) => ({
          enrolmentId: e.id!,
          enrolmentStatus: e.status!,
          completedMarks: completed.get(e.id!)!,
        })),
        term.kind as "term",
      );
      for (const [i, p] of ranked.entries()) {
        const e = classEnrolments[i]!;
        positions.push([
          term.id!,
          cls.id!,
          e.id!,
          learners.get(e.learner_id!)!.learner_number!,
          String(p.subjectsCounted),
          p.average === null ? "" : p.average.toFixed(1),
          p.position === null ? "" : String(p.position),
          String(p.classSize),
        ]);
      }
    }
  }
  return { results, positions };
}

const expectedRows = (name: string) => {
  const [, ...rows] = parseCsv(readFileSync(path.join(root, "seed", `${name}.csv`), "utf8"));
  return rows.filter((r) => r.length > 1);
};
const sorted = (rows: string[][]) => rows.map((r) => r.join(",")).sort();

describe("grading fixtures", () => {
  const computed = computeFromSeed();

  it("reproduces every row of expected_subject_results.csv", () => {
    const expected = expectedRows("expected_subject_results");
    expect(expected).toHaveLength(486);
    expect(sorted(computed.results)).toEqual(sorted(expected));
  });

  it("reproduces every row of expected_class_positions.csv, including the tie", () => {
    const expected = expectedRows("expected_class_positions");
    expect(expected).toHaveLength(60);
    expect(sorted(computed.positions)).toEqual(sorted(expected));
    const tied = expected.filter(
      (r) => r[1] === "c7eb866b-a0b6-523d-a1dc-b5e1fef26daf" && r[6] === "4",
    );
    expect(tied).toHaveLength(2);
  });

  it("holds the SQL to the same rows: the generated pgTAP fixture test is up to date", () => {
    const committed = readFileSync(path.join(root, FIXTURE_TEST_PATH), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(committed === buildFixtureTest(root)).toBe(true);
  });
});
