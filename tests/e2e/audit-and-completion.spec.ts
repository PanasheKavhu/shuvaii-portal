import { expect, test, type Page } from "@playwright/test";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// The audit log screen (D35) and completion tracking (US-4.8, D36), at
// 360 px (the mobile project) and on a desktop screen. Each test makes its
// own school, so counts and log rows never mix between runs.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A marks grid cell, or the comment column; on a phone, picks the column first. */
async function column(page: Page, name: string) {
  if (isPhone(page)) {
    await page
      .getByRole("group", { name: "Assessment" })
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click();
  }
}

/**
 * Types a mark and waits for "Saved". Retried: on a busy dev server the grid
 * can hydrate after the first fill, which then never saves (as in
 * marks-upload.spec.ts).
 */
async function enterMark(page: Page, input: ReturnType<Page["getByLabel"]>, value: string) {
  await expect(async () => {
    await input.fill("");
    await input.fill(value);
    await expect(page.locator(`[id="${await input.getAttribute("aria-describedby")}"]`)).toHaveText(
      "Saved",
      { timeout: 5_000 },
    );
  }).toPass({ timeout: 30_000 });
}

test("a teacher's mark change is found in the audit log by learner", async ({ page, browser }) => {
  test.setTimeout(120_000);
  // The helper's first learner has 0 out of 30 for Test 1.
  const school = await createMarksClass("audit", { marks: true, head: true });
  const learner = school.learners[0]!;

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(`/marks/${school.mathsId}/${school.termId}`);
  await column(page, "Test 1");
  const t1 = page.getByLabel(`Test 1 for ${learner.name}`);
  await enterMark(page, t1, "23");

  // The head finds it from the menu, by typing the learner's name.
  const headContext = await browser.newContext({ viewport: page.viewportSize()! });
  const head = await headContext.newPage();
  await signIn(head, school.headEmail!);
  await expect(head).not.toHaveURL(/sign-in/);
  await head
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await expect(head.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await head.getByText("Filter changes").click();
  await head.getByLabel("Learner (name or number)").fill(learner.name);
  await head.getByRole("button", { name: "Show changes" }).click();
  await expect(head.getByTestId("learner-filter")).toContainText(learner.name);

  const changes = head.getByRole("list", { name: "Changes" });
  const entry = changes.getByRole("listitem").filter({ hasText: "from 0 to 23" });
  await expect(entry).toContainText(
    `${school.teacherName} changed ${learner.name}'s Test 1 mark in 4 Blue Mathematics from 0 to 23`,
  );
  await expect(entry).toContainText("Term Now");
  await expect(entry).toContainText("Old: 0");
  await expect(entry).toContainText("New: 23");
  // Only this learner's rows, and never raw data.
  for (const other of school.learners.slice(1)) await expect(changes).not.toContainText(other.name);
  await expect(changes).not.toContainText("enrolment_id");
  await expect(changes).not.toContainText("{");

  // The class and "changed by" filters find it too; a date range before today does not.
  await head.goto(`/admin/audit?class=${school.classId}`);
  await expect(head.getByRole("list", { name: "Changes" })).toContainText("from 0 to 23");
  await head.getByLabel("To", { exact: true }).fill("2020-01-01");
  await head.getByRole("button", { name: "Show changes" }).click();
  await expect(head.getByText("No changes match these filters.")).toBeVisible();
  await headContext.close();
});

test("completion counts drop as marks and comments are entered", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("complete");
  const learner = school.learners[0]!;
  // One Mathematics assessment out of 10 at 100%; English (the hod's) has none.
  const db = await signedInClient(school.teacherEmail);
  const { error } = await db.from("assessments").insert({
    school_id: school.schoolId,
    term_id: school.termId,
    class_subject_id: school.mathsId,
    name: "Exam",
    type: "exam",
    max_mark: 10,
    weight_percent: 100,
  });
  expect(error).toBeNull();

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Completion" }).click();
  await expect(page.getByRole("heading", { name: "Completion" })).toBeVisible();
  const total = (id: string) => page.getByTestId(`total-${id}`);
  await expect(total("marks")).toHaveText("3");
  await expect(total("comments")).toHaveText("3");
  await expect(total("class-comments")).toHaveText("3");
  await expect(total("weights")).toHaveText("0");
  // A teacher sees only their own class subject, not the hod's English.
  await expect(page.getByRole("main")).not.toContainText("English");

  // A mark and a subject comment on the grid, straight from the link.
  await page.getByRole("link", { name: /Mathematics/ }).click();
  await expect(page).toHaveURL(`/marks/${school.mathsId}/${school.termId}`);
  await column(page, "Exam");
  const exam = page.getByLabel(`Exam for ${learner.name}`);
  await enterMark(page, exam, "7");
  await column(page, "Teacher's comment");
  const commentLabel = `Teacher's comment for ${learner.name}`;
  await page.getByRole("textbox", { name: commentLabel, exact: true }).fill("Steady work.");
  await page.getByRole("checkbox", { name: `Done with ${commentLabel}` }).check();
  await expect(
    page
      .getByRole("textbox", { name: commentLabel, exact: true })
      .locator("xpath=..")
      .getByRole("status"),
  ).toHaveText("Saved and marked done");

  await page.goto("/marks/completion");
  await expect(total("marks")).toHaveText("2");
  await expect(total("comments")).toHaveText("2");
  await expect(total("class-comments")).toHaveText("3");

  // A class comment from the class screen.
  await page.getByRole("link", { name: /class comments/i }).click();
  await expect(page).toHaveURL(`/marks/classes/${school.classId}/${school.termId}`);
  const classLabel = `Class teacher's comment for ${learner.name}`;
  await page.getByRole("textbox", { name: classLabel, exact: true }).fill("A good term.");
  await page.getByRole("checkbox", { name: `Done with ${classLabel}` }).check();
  await expect(
    page
      .getByRole("textbox", { name: classLabel, exact: true })
      .locator("xpath=..")
      .getByRole("status"),
  ).toHaveText("Saved and marked done");

  await page.goto("/marks/completion");
  await expect(total("class-comments")).toHaveText("2");
  await expect(total("marks")).toHaveText("2");
});

test("school admin sees every class subject by class and by teacher, with weight problems", async ({
  page,
}) => {
  const school = await createMarksClass("completeadmin", { marks: true });
  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Completion" })
    .click();
  // Maths has its three assessments (100%); English has none.
  await expect(page.getByTestId("total-weights")).toHaveText("1");
  await expect(page.getByTestId("total-marks")).toHaveText("0");
  const blue = page.getByRole("region", { name: "4 Blue" });
  await expect(blue.getByRole("link", { name: "No assessments yet" })).toHaveAttribute(
    "href",
    `/marks/${school.englishId}/${school.termId}/assessments`,
  );
  await page.getByRole("link", { name: "By teacher" }).click();
  await expect(page.getByRole("region", { name: school.teacherName })).toContainText(
    "4 Blue Mathematics",
  );
  await expect(page.getByRole("region", { name: school.hodName })).toContainText("4 Blue English");
});

test("a teacher gets 403 on the audit log", async ({ page }) => {
  const school = await createMarksClass("audit403");
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  const res = await page.goto("/admin/audit");
  expect(res?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Changes" })).toHaveCount(0);
});
