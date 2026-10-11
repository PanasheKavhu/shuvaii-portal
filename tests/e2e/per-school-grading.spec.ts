import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  MSASA,
  MSASA_ADMIN,
  PLATFORM_ADMIN,
  createMarksClass,
  signIn,
  signedInClient,
} from "./helpers";

// Grading is a per-school choice (D38, D40, D41, D42): each school's own
// key grades the same mark its own way, a band change warns and is audited,
// the school's usual set feeds the one-tap set, the console shows each
// school's key, and the seed school still matches its fixtures.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const result = (page: Page, learner: string) =>
  page.getByRole("status", { name: `Result for ${learner}` });

/** One Exam out of 100 at 100% for Mathematics, and a mark of `score` for the first learner. */
async function examMark(school: Awaited<ReturnType<typeof createMarksClass>>, score: number) {
  const db = await signedInClient(school.adminEmail);
  const exam = await db
    .from("assessments")
    .insert({
      school_id: school.schoolId,
      term_id: school.termId,
      class_subject_id: school.mathsId,
      name: "Exam",
      type: "exam",
      max_mark: 100,
      weight_percent: 100,
    })
    .select("id")
    .single();
  if (exam.error) throw new Error("Could not add the exam");
  const mark = await db.from("marks").insert({
    school_id: school.schoolId,
    assessment_id: exam.data.id,
    enrolment_id: school.learners[0]!.enrolmentId,
    score,
    status: "present",
  });
  if (mark.error) throw new Error("Could not add the mark");
  return db;
}

async function scaleAndYear(db: Awaited<ReturnType<typeof signedInClient>>, schoolId: string) {
  const scale = await db.from("grading_scales").select("id").eq("school_id", schoolId).single();
  const year = await db.from("academic_years").select("id").eq("school_id", schoolId).single();
  if (scale.error || year.error) throw new Error("Could not read the scale and year");
  return { scaleId: scale.data.id, yearId: year.data.id };
}

const LATE_A = [
  { grade: "A", min_mark: 71, max_mark: 100, remark: null },
  { grade: "B", min_mark: 60, max_mark: 70, remark: null },
  { grade: "C", min_mark: 50, max_mark: 59, remark: null },
  { grade: "D", min_mark: 45, max_mark: 49, remark: null },
  { grade: "E", min_mark: 40, max_mark: 44, remark: null },
  { grade: "U", min_mark: 0, max_mark: 39, remark: null },
];

test("two schools with different keys grade the same mark differently", async ({ page }) => {
  test.setTimeout(150_000);
  const first = await createMarksClass("key-a", { learners: 1 });
  const second = await createMarksClass("key-b", { learners: 1 });

  // The second school's own key starts A at 71, so 70 is a B there.
  await examMark(first, 70);
  const secondDb = await examMark(second, 70);
  const { scaleId } = await scaleAndYear(secondDb, second.schoolId);
  const saved = await secondDb.rpc("save_grading_bands", { p_scale_id: scaleId, p_bands: LATE_A });
  expect(saved.error).toBeNull();

  for (const [school, grade] of [
    [first, "A"],
    [second, "B"],
  ] as const) {
    const learner = school.learners[0]!.name;
    await signIn(page, school.teacherEmail);
    await expect(page).not.toHaveURL(/sign-in/);
    await page.goto(`/marks/${school.mathsId}/${school.termId}`);
    await expect(result(page, learner)).toContainText(`70${grade}`);

    // The database agrees: the same 70 is graded by each school's own bands.
    const db = await signedInClient(school.adminEmail);
    const rows = await db.rpc("subject_results", {
      p_class_id: school.classId,
      p_term_id: school.termId,
    });
    const maths = rows.data!.find((r) => r.class_subject_id === school.mathsId)!;
    expect([maths.rounded_mark, maths.grade]).toEqual([70, grade]);
    await page.context().clearCookies();
  }
});

test("a band change after marks warns first, regrades and is in the audit log", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const school = await createMarksClass("key-warn", { learners: 1 });
  const db = await examMark(school, 70);
  const { scaleId, yearId } = await scaleAndYear(db, school.schoolId);
  const learner = school.learners[0]!.name;

  await signIn(page, school.adminEmail);
  await expect(page).not.toHaveURL(/sign-in/);
  await page.goto(`/admin/setup/${yearId}/grading`);
  await expect(page.getByRole("list", { name: "Scale used by each grade level" })).toContainText(
    "O-Level · Complete",
  );
  await page.goto(`/admin/setup/${yearId}/grading/${scaleId}`);
  const warning = page.getByRole("note", { name: "Band change warning" });
  await expect(warning).toHaveCount(0);

  // A remark alone changes no grade, so no warning.
  await page.getByLabel("Remark, band 1").fill("Excellent");
  await expect(warning).toHaveCount(0);

  // Moving the A/B boundary regrades the marked class subject.
  await page.getByLabel("Lowest mark, band 1").fill("71");
  await page.getByLabel("Highest mark, band 2").fill("70");
  await expect(warning).toContainText(
    "This changes the grades of 1 class subject in Term Now that already have marks.",
  );
  await page.getByRole("button", { name: "Save and change these grades" }).click();
  await expect(
    page.getByText("Bands saved. They cover 0 to 100 with no gaps or overlaps."),
  ).toBeVisible();

  await page.goto(`/marks/${school.mathsId}/${school.termId}`);
  await expect(result(page, learner)).toContainText("70B");

  await page.goto("/admin/audit");
  const change = page
    .getByRole("list", { name: "Changes" })
    .getByRole("listitem")
    .filter({ hasText: "changed the grading bands of O-Level" })
    // Newest first; the older row is the bands the helper first wrote (D40).
    .first();
  await expect(change).toContainText("A 70 to 100");
  await expect(change).toContainText("A 71 to 100 (Excellent)");
});

test("the one-tap set is the school's own usual set", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("key-set", { learners: 1 });
  const db = await signedInClient(school.adminEmail);
  const set = await db.rpc("save_assessment_set", {
    p_school_id: school.schoolId,
    p_term_kind: "term",
    p_items: [
      { name: "Coursework", type: "assignment", max_mark: 40, weight_percent: 30 },
      { name: "Final exam", type: "exam", max_mark: 100, weight_percent: 70 },
    ],
  });
  expect(set.error).toBeNull();

  await signIn(page, school.teacherEmail);
  await expect(page).not.toHaveURL(/sign-in/);

  await expect(page).not.toHaveURL(/sign-in/);
  await page.goto(`/marks/${school.mathsId}/${school.termId}/assessments`);
  await expect(
    page.getByText("Coursework out of 40 at 30%, Final exam out of 100 at 70%."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Coursework and Final exam" }).click();
  await expect(page.getByRole("status", { name: "Weight total" })).toHaveText(
    "Weights add up to 100.",
  );
  await expect(page.getByRole("form", { name: "Final exam" }).getByLabel("Out of")).toHaveValue(
    "100",
  );
});

test("the console shows each school's grading key", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("key-console", { learners: 1 });
  const db = await signedInClient(school.adminEmail);
  // A second level on a blank scale, so the school's key is not complete yet.
  const draft = await db
    .from("grading_scales")
    .insert({ school_id: school.schoolId, name: "Form 5 key", stage: "a_level" })
    .select("id")
    .single();
  expect(draft.error).toBeNull();
  const level = await db.from("grade_levels").insert({
    school_id: school.schoolId,
    name: "Form 5",
    stage: "a_level",
    sort_order: 5,
    grading_scale_id: draft.data!.id,
  });
  expect(level.error).toBeNull();

  await signIn(page, PLATFORM_ADMIN);
  await expect(page).not.toHaveURL(/sign-in/);

  await expect(page).not.toHaveURL(/sign-in/);
  await page.goto(`/platform/schools/${school.schoolId}`);
  await expect(page.getByRole("status", { name: "Grading key status" })).toHaveText(
    "1 of 2 grade levels still needs a complete grading scale.",
  );
  await expect(page.getByRole("list", { name: "Grade levels and their scales" })).toContainText(
    "Form 5Form 5 key · Not complete",
  );

  await page.goto(`/platform/schools/${MSASA.id}`);
  await expect(page.getByRole("status", { name: "Grading key status" })).toHaveText(
    "Every grade level has a complete grading scale.",
  );
});

test("the seed school's results still match the seed fixtures", async () => {
  const csv = (name: string) => {
    const [header, ...lines] = readFileSync(path.join("seed", `${name}.csv`), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((l) => l.split(","));
    return lines.map((cells) => Object.fromEntries(header!.map((h, i) => [h, cells[i] ?? ""])));
  };
  const msasaClasses = new Set(
    csv("classes")
      .filter((c) => c.school_id === MSASA.id)
      .map((c) => c.id),
  );
  const expected = csv("expected_subject_results").filter((r) => msasaClasses.has(r.class_id!));
  expect(expected.length).toBeGreaterThan(200);

  const db = await signedInClient(MSASA_ADMIN);
  const pairs = [...new Set(expected.map((r) => `${r.class_id}|${r.term_id}`))];
  const actual = new Map<string, string>();
  for (const pair of pairs) {
    const [classId, termId] = pair.split("|") as [string, string];
    const rows = await db.rpc("subject_results", { p_class_id: classId, p_term_id: termId });
    expect(rows.error).toBeNull();
    for (const r of rows.data!) {
      actual.set(
        `${r.term_id}|${r.enrolment_id}|${r.class_subject_id}`,
        [r.result_status === "complete" ? r.rounded_mark : "", r.grade ?? "", r.result_status].join(
          " ",
        ),
      );
    }
  }
  for (const r of expected) {
    expect(
      actual.get(`${r.term_id}|${r.enrolment_id}|${r.class_subject_id}`),
      r.learner_number,
    ).toBe([r.rounded_mark, r.grade, r.result_status].join(" "));
  }
});
