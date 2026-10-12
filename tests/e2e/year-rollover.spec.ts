import { expect, test } from "@playwright/test";
import { signIn, signedInClient } from "./helpers";
import {
  approvedClass,
  expectNoSideScroll,
  parentOf,
  publishWithPdfs,
  serviceClient,
} from "./report-helpers";

// US-3.5 (D53): the school admin rolls a school over at 360 px with one
// repeater and one leaver, previewing first, then makes the next year
// current; the parent of the learner who moved up still sees last year's
// published report next to the new year's empty list. It runs on a school
// of its own shaped like the seed's (Form 4 class 4 Blue with published
// reports, and a Form 5 to move into): rolling the shared seed school over
// would change what every other spec reads, and nothing a rollover does can
// be undone (D53).

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

test("roll a school over with a repeater and a leaver; the family keeps last year's report", async ({
  page: headPage,
  browser,
}) => {
  let page = headPage;
  test.setTimeout(300_000);
  const school = await approvedClass("rollover");
  const [chipo, farai, tatenda] = school.learners as [
    (typeof school.learners)[0],
    (typeof school.learners)[0],
    (typeof school.learners)[0],
  ];
  const parentEmail = await parentOf(school.schoolId, [chipo.id], "rollover");
  await publishWithPdfs(page, school, 3);

  // The next year and the level above Form 4.
  const admin = await signedInClient(school.adminEmail);
  const { data: scale } = await admin
    .from("grading_scales")
    .select("id")
    .eq("school_id", school.schoolId)
    .single();
  expect(
    (
      await admin.from("grade_levels").insert({
        school_id: school.schoolId,
        name: "Form 5",
        stage: "a_level",
        sort_order: 1,
        grading_scale_id: scale!.id,
      })
    ).error,
  ).toBeNull();
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const { data: next, error } = await admin
    .from("academic_years")
    .insert({
      school_id: school.schoolId,
      label: "Next year",
      starts_on: day(210),
      ends_on: day(540),
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  // The admin, at 360 px.
  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const adminPage = await context.newPage();
  await signIn(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/admin");
  await adminPage.getByRole("link", { name: /Roll over the year/ }).click();
  await expect(adminPage.getByRole("heading", { name: "Roll over This year" })).toBeVisible();

  const card = adminPage.getByRole("article", { name: "4 Blue" });
  await expect(card.getByLabel("In Next year, 4 Blue")).toHaveValue("new");
  await expect(card.getByLabel("In Next year, 4 Blue").locator("option:checked")).toHaveText(
    "Moves up to a new class, 5 Blue (Form 5)",
  );
  await card.getByText("Repeaters, leavers and single learners").click();
  await card.getByLabel(farai.name).selectOption({ label: "Repeats in 4 Blue" });
  await card.getByLabel(tatenda.name).selectOption({ label: "Leaves the school" });
  await expect(card.getByLabel(chipo.name)).toHaveValue("up");
  await expectNoSideScroll(adminPage);

  await adminPage.getByRole("button", { name: "Preview" }).click();
  const preview = adminPage.getByRole("region", { name: "Preview: nothing has changed yet" });
  await expect(preview).toContainText("1 moving up, 1 repeating, 1 leaving.");
  await expect(preview).toContainText("New Next year classes: 5 Blue, 4 Blue");
  await expect(preview).toContainText(`${farai.name} (4 Blue) repeats in 4 Blue`);
  await expect(preview).toContainText(`${tatenda.name} (4 Blue) leaves the school`);
  await expect(preview).toContainText("Every subject choice carries over into Next year.");
  await expectNoSideScroll(adminPage);

  // The preview changed nothing.
  const service = serviceClient();
  const statuses = async (yearId: string) =>
    (
      await service
        .from("enrolments")
        .select("learner_id, status, classes!inner(name)")
        .eq("academic_year_id", yearId)
    ).data!;
  const { data: thisYear } = await service
    .from("academic_years")
    .select("id")
    .eq("school_id", school.schoolId)
    .eq("is_current", true)
    .single();
  expect((await statuses(thisYear!.id)).every((e) => e.status === "enrolled")).toBe(true);
  expect(await statuses(next!.id)).toEqual([]);

  await preview.getByRole("button", { name: "Roll over into Next year" }).click();
  const done = adminPage.getByRole("region", { name: "This year is rolled over into Next year" });
  await expect(done.getByRole("status")).toHaveText("1 moved up, 1 repeating, 1 left.");

  const byLearner = (rows: Awaited<ReturnType<typeof statuses>>) =>
    Object.fromEntries(rows.map((r) => [r.learner_id, `${r.classes.name} ${r.status}`]));
  expect(byLearner(await statuses(thisYear!.id))).toEqual({
    [chipo.id]: "4 Blue promoted",
    [farai.id]: "4 Blue repeating",
    [tatenda.id]: "4 Blue left",
  });
  expect(byLearner(await statuses(next!.id))).toEqual({
    [chipo.id]: "5 Blue enrolled",
    [farai.id]: "4 Blue enrolled",
  });
  const { data: reports } = await service
    .from("reports")
    .select("status")
    .eq("school_id", school.schoolId);
  expect(reports!.map((r) => r.status)).toEqual(["published", "published", "published"]);

  // The next year becomes current only once the admin confirms.
  const makeCurrent = adminPage.getByRole("button", { name: "Make Next year current" });
  await expect(makeCurrent).toBeDisabled();
  await adminPage.getByLabel("I have checked Next year and want to make it current").check();
  await makeCurrent.click();
  await expect(adminPage).toHaveURL(`/admin/setup/${next!.id}`);
  await context.close();

  // The parent of the learner who moved up, in a browser of their own.
  const family = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  page = await family.newPage();
  await signIn(page, parentEmail);
  await expect(page).toHaveURL("/children");
  await expect(page.getByRole("heading", { name: "Next year · 5 Blue" })).toBeVisible();
  await expect(page.getByText("No reports yet for Next year.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "This year · 4 Blue" })).toBeVisible();
  const lastYear = page.getByRole("list", { name: "Reports for This year" });
  await lastYear.getByRole("link", { name: /Term Now/ }).click();
  await expect(page).toHaveURL(/\/children\/reports\//);
  await expect(page.getByText(chipo.name).first()).toBeVisible();
  await expectNoSideScroll(page);
  await family.close();
});
