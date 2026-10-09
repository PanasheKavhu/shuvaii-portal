import { expect, test, type Page } from "@playwright/test";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// US-4.1, US-4.2, US-4.4, US-4.5 at 360 px (the mobile project) and on a
// desktop screen. Each test makes its own school (createMarksClass), so
// runs never share marks, which are never deleted.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A grid cell; on a phone, picks its assessment first (one is shown at a time). */
async function cell(page: Page, assessment: string, learner: string) {
  if (isPhone(page)) {
    await page
      .getByRole("group", { name: "Assessment" })
      .getByRole("button", { name: new RegExp(`^${assessment} `) })
      .click();
  }
  return page.getByLabel(`${assessment} for ${learner}`);
}

const result = (page: Page, learner: string) =>
  page.getByRole("status", { name: `Result for ${learner}` });

test("a teacher starts from the usual set, enters marks and sees grades, refusals and incomplete", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("marks");
  const [first, second, third] = [0, 1, 2].map((i) => school.learners[i]!) as [
    (typeof school.learners)[number],
    (typeof school.learners)[number],
    (typeof school.learners)[number],
  ];

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  const mine = page.getByRole("list", { name: "My class subjects" });
  await expect(mine.getByRole("link")).toHaveCount(1); // not the hod's English
  await expect(mine).toContainText("No assessments yet · 3 learners");
  await mine.getByRole("link", { name: /Mathematics/ }).click();
  await expect(page.getByRole("heading", { name: "Mathematics, 4 Blue" })).toBeVisible();

  // US-4.1: the usual set in one tap; the total reaches 100.
  await page.getByRole("link", { name: "Set up assessments" }).click();
  await page.getByRole("button", { name: "Add Test 1, Test 2 and Exam" }).click();
  await expect(page.getByRole("status", { name: "Weight total" })).toHaveText(
    "Weights add up to 100.",
  );
  await expect(page.getByRole("form", { name: "Exam" }).getByLabel("Out of")).toHaveValue("100");

  // US-4.2: marks save per cell and the grade follows.
  await page
    .getByRole("navigation", { name: "Marks pages" })
    .getByRole("link", { name: "Marks" })
    .click();
  const t1 = await cell(page, "Test 1", first.name);
  await t1.fill("21");
  await expect(page.locator(`[id="${await t1.getAttribute("aria-describedby")}"]`)).toHaveText(
    "Saved",
  );
  await (await cell(page, "Test 2", first.name)).fill("33");
  await expect(result(page, first.name)).toContainText("Incomplete: a mark is missing");
  await (await cell(page, "Exam", first.name)).fill("62");
  // The worked example: 14.0 + 13.2 + 37.2 = 64.4, so 64, a B, live and then saved.
  await expect(result(page, first.name)).toContainText("64B");
  await expect(result(page, first.name)).toContainText("Saved: 64 B");

  if (isPhone(page)) {
    // One assessment at a time, with large inputs.
    await expect(page.getByLabel(`Test 1 for ${first.name}`)).toBeHidden();
    const box = await page.getByLabel(`Exam for ${first.name}`).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // Enter moves down the column.
  const examSecond = page.getByLabel(`Exam for ${second.name}`);
  await page.getByLabel(`Exam for ${first.name}`).press("Enter");
  await expect(examSecond).toBeFocused();

  // 31 out of 30 is refused in the cell and never saved.
  const bad = await cell(page, "Test 1", second.name);
  await bad.fill("31");
  await expect(bad).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(`[id="${await bad.getAttribute("aria-describedby")}"]`)).toHaveText(
    "31 is more than the maximum of 30.",
  );

  // US-4.4: absent makes the subject incomplete.
  if (isPhone(page)) {
    await cell(page, "Test 1", third.name);
    await page.getByRole("button", { name: `Absent for ${third.name}` }).click();
  } else {
    await (await cell(page, "Test 1", third.name)).fill("a");
  }
  await expect(page.getByLabel(`Test 1 for ${third.name}`)).toHaveValue("A");
  await expect(result(page, third.name)).toContainText("Incomplete: absent");
  await expect(result(page, third.name)).toContainText("Saved: incomplete: absent");

  await page.reload();
  await expect(await cell(page, "Test 1", second.name)).toHaveValue("");
  await expect(await cell(page, "Test 1", third.name)).toHaveValue("A");
  await expect(await cell(page, "Test 1", first.name)).toHaveValue("21");

  // Weights that do not add up to 100 are flagged, live and on the grid.
  await page
    .getByRole("navigation", { name: "Marks pages" })
    .getByRole("link", { name: "Assessments" })
    .click();
  const exam = page.getByRole("form", { name: "Exam" });
  await exam.getByLabel("Weight (%)").fill("50");
  await expect(page.getByRole("status", { name: "Weight total" })).toContainText(
    "Weights add up to 90, 10 short of 100.",
  );
  await exam.getByRole("button", { name: "Save Exam" }).click();
  await expect(exam.getByRole("status")).toHaveText("Exam saved.");
  await page
    .getByRole("navigation", { name: "Marks pages" })
    .getByRole("link", { name: "Marks" })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "Weights add up to" })).toContainText(
    "Weights add up to 90, 10 short of 100.",
  );
  await expect(result(page, first.name)).toContainText("Incomplete: weights do not add up to 100");

  // Back on My classes, progress shows the marks entered.
  await page.goto("/teaching");
  await expect(mine).toContainText("4 of 9 marks · 3 learners");
  await expect(mine).toContainText("Weights add up to 90, not 100");
});

test("a teacher gets 403 on another teacher's grid", async ({ page }) => {
  const school = await createMarksClass("marks403");
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");

  for (const path of [
    `/marks/${school.englishId}/${school.termId}`,
    `/marks/${school.englishId}/${school.termId}/assessments`,
    "/marks",
  ]) {
    const res = await page.goto(path);
    if (path === "/marks") {
      // The all-subjects list is for admin and head; a teacher goes to their own.
      await expect(page).toHaveURL("/teaching");
      continue;
    }
    expect(res?.status(), path).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Marks" })).toHaveCount(0);
  }
});

test("locked marks are read-only for the teacher; the admin edits, unlocks with a reason and relocks", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("marklock", { marks: true });
  const first = school.learners[0]!;
  const admin = await signedInClient(school.adminEmail);
  const { error } = await admin.from("terms").update({ status: "locked" }).eq("id", school.termId);
  expect(error).toBeNull();
  const gridPath = `/marks/${school.mathsId}/${school.termId}`;

  // The teacher sees a read-only grid, why, and who to ask.
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(gridPath);
  const notice = page.getByRole("status", { name: "Marks locked" });
  await expect(notice).toContainText("These marks are read-only because the term is locked.");
  await expect(notice).toContainText(
    `ask ${school.adminName} (school admin) to unlock Mathematics for 4 Blue`,
  );
  await expect(await cell(page, "Test 1", first.name)).toHaveAttribute("readonly", "");

  // The school admin opens the same grid from Marks, changes a mark (audited) and unlocks.
  const adminContext = await browser.newContext({ viewport: page.viewportSize()! });
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/admin");
  await adminPage
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Marks" })
    .click();
  await adminPage
    .getByRole("list", { name: "4 Blue subjects" })
    .getByRole("link", { name: /Mathematics/ })
    .click();
  await expect(adminPage.getByRole("region", { name: "Marks locked" })).toContainText(
    "Teachers cannot change these marks because the term is locked.",
  );
  const adminCell = await cell(adminPage, "Test 1", first.name);
  await adminCell.fill("29");
  await expect(
    adminPage.locator(`[id="${await adminCell.getAttribute("aria-describedby")}"]`),
  ).toHaveText("Saved");
  const { data: me } = await admin.auth.getUser();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("school_id", school.schoolId)
    .eq("table_name", "marks")
    .eq("action", "update")
    .eq("actor_id", me.user!.id);
  expect(count).toBe(1);

  const unlock = adminPage.getByRole("form", { name: "Unlock marks" });
  await unlock.getByRole("button", { name: "Unlock for the teacher" }).click();
  await expect(unlock.getByRole("alert")).toContainText("Give a reason for unlocking.");
  await unlock.getByLabel("Reason for unlocking").fill("Re-marked Test 1 scripts");
  await unlock.getByRole("button", { name: "Unlock for the teacher" }).click();
  await expect(adminPage.getByRole("region", { name: "Marks unlocked" })).toContainText(
    "Re-marked Test 1 scripts",
  );

  // The teacher can now type, until the admin relocks.
  await page.reload();
  await expect(page.getByRole("region", { name: "Marks unlocked" })).toContainText(
    `Unlocked by ${school.adminName}`,
  );
  const teacherCell = await cell(page, "Test 1", first.name);
  await expect(teacherCell).toHaveValue("29");
  await teacherCell.fill("28");
  await expect(
    page.locator(`[id="${await teacherCell.getAttribute("aria-describedby")}"]`),
  ).toHaveText("Saved");

  await adminPage.reload();
  await adminPage.getByRole("button", { name: "Relock marks" }).click();
  await expect(adminPage.getByRole("region", { name: "Marks locked" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status", { name: "Marks locked" })).toBeVisible();
  await adminContext.close();
});
