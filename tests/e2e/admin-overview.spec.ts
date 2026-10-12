import { expect, test, type Page } from "@playwright/test";
import { createMarksClass, signIn, signedInClient } from "./helpers";
import { approvedClass, expectNoSideScroll, publishWithPdfs } from "./report-helpers";

// The overview and browse (US-9.1, US-9.2; D51) at 360 px (the mobile
// project) and on a desktop screen. Each test makes its own schools, so the
// counts are known exactly.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const count = (page: Page, id: string) => page.getByTestId(`count-${id}`);

async function search(page: Page, text: string) {
  await page.getByRole("searchbox", { name: "Find a learner, staff member or class" }).fill(text);
  await page.getByRole("button", { name: "Search" }).click();
}

/** An approved class (3 learners, Maths marked) with one English assessment and no English marks yet. */
async function overviewSchool(prefix: string) {
  const school = await approvedClass(prefix);
  const admin = await signedInClient(school.adminEmail);
  const { error } = await admin.from("assessments").insert({
    school_id: school.schoolId,
    term_id: school.termId,
    class_subject_id: school.englishId,
    name: "Essay",
    type: "assignment",
    max_mark: 50,
    weight_percent: 100,
  });
  expect(error).toBeNull();
  return school;
}

test("the admin's overview counts follow a mark and a published report, and lead to the grid and a learner's report", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const school = await overviewSchool("overview");
  const learner = school.learners[0]!;

  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(count(page, "learners")).toHaveText("3");
  await expect(count(page, "staff")).toHaveText("4");
  await expect(count(page, "marks")).toHaveText("3");
  await expect(count(page, "reports-approved")).toHaveText("3");
  await expect(count(page, "reports-published")).toHaveText("0");
  await expect(
    page.getByRole("list", { name: "Latest changes" }).getByRole("listitem"),
  ).toHaveCount(20);
  await expectNoSideScroll(page);

  // Into the grid from the class's gaps, and enter one mark.
  const byClass = page.getByRole("list", { name: "Missing by class" });
  await byClass.getByText("4 Blue", { exact: true }).click();
  await byClass.getByRole("link", { name: /^English/ }).click();
  await expect(page).toHaveURL(`/marks/${school.englishId}/${school.termId}`);
  if (isPhone(page))
    await page
      .getByRole("group", { name: "Assessment" })
      .getByRole("button", { name: /^Essay / })
      .click();
  const essay = page.getByLabel(`Essay for ${learner.name}`);
  await essay.fill("40");
  await expect(page.locator(`[id="${await essay.getAttribute("aria-describedby")}"]`)).toHaveText(
    "Saved",
  );
  await page.goto("/admin");
  await expect(count(page, "marks")).toHaveText("2");

  // The head publishes; the admin sees it.
  const headContext = await browser.newContext({ viewport: page.viewportSize()! });
  await publishWithPdfs(await headContext.newPage(), school, 3);
  await headContext.close();
  await page.reload();
  await expect(count(page, "reports-published")).toHaveText("3");
  await expect(count(page, "reports-approved")).toHaveText("0");
  await expect(page.getByRole("list", { name: "Reports by class" })).toContainText(
    "4 Blue3 published",
  );

  // Find the learner by number; the search stays out of the address (D37).
  await search(page, "M001");
  await expect(page).toHaveURL("/admin");
  await page.getByRole("list", { name: "Learners" }).getByRole("link", { name: /M001/ }).click();
  await expect(page.getByRole("heading", { name: learner.name, level: 1 })).toBeVisible();
  const reports = page.getByRole("list", { name: "Reports" });
  await expect(reports).toContainText("Term Now");
  await expect(reports).toContainText("Published");
  const pdf = reports.getByRole("link", { name: /Open PDF/ });
  const response = await page.request.get((await pdf.getAttribute("href"))!);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  await expect(page.getByRole("list", { name: "Results for Term Now" })).toContainText(
    "Mathematics",
  );
  await expectNoSideScroll(page);
});

test("a head sees the same overview and profiles; a teacher gets 403", async ({ page }) => {
  test.setTimeout(150_000);
  const school = await overviewSchool("overview-head");

  await signIn(page, school.headEmail!);
  await expect(page).toHaveURL("/admin");
  await expect(count(page, "learners")).toHaveText("3");
  await expect(count(page, "staff")).toHaveText("4");
  await expect(count(page, "marks")).toHaveText("3");
  await expect(count(page, "reports-approved")).toHaveText("3");
  // No People screen for the head, so those numbers are not links.
  await expect(page.getByRole("link", { name: /Active learners/ })).toHaveCount(0);

  await search(page, "M002");
  await page.getByRole("list", { name: "Learners" }).getByRole("link", { name: /M002/ }).click();
  await expect(
    page.getByRole("heading", { name: school.learners[1]!.name, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Reports" })).toContainText("Approved");
  await page.getByRole("link", { name: "4 Blue" }).first().click();
  await expect(page.getByRole("heading", { name: "4 Blue", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Reports by status" })).toContainText("3 approved");
  await expectNoSideScroll(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  for (const path of [
    "/admin",
    `/admin/browse/learners/${school.learners[0]!.id}`,
    `/admin/browse/classes/${school.classId}`,
    "/admin/parents",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
  }
});

test("a hod finds only their own classes' learners and sees no school-wide numbers", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("overview-hod", { secondClass: true });
  // The hod teaches English in 4 Blue and is class teacher of 3 Green: both are theirs.
  await signIn(page, school.hodEmail);
  await expect(page).toHaveURL("/department");
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByTestId("count-learners")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Reports" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Missing by class" })).toContainText("3 Green");
  await search(page, "Learner01");
  await expect(page.getByRole("list", { name: "Learners" }).getByRole("link")).toHaveCount(1);
  await search(page, school.teacherName);
  await expect(page.getByRole("status")).toContainText("Nothing found");
  const res = await page.goto("/admin/parents");
  expect(res?.status()).toBe(403);
});

test("a school A admin cannot find or open a school B learner", async ({ page }) => {
  test.setTimeout(120_000);
  const [a, b] = await Promise.all([
    createMarksClass("overview-a"),
    createMarksClass("overview-b", { secondClass: true }),
  ]);
  const admin = await signedInClient(b.adminEmail);
  const { data: green } = await admin
    .from("learners")
    .select("id")
    .eq("school_id", b.schoolId)
    .eq("learner_number", "G001")
    .single();

  await signIn(page, a.adminEmail);
  await expect(page).toHaveURL("/admin");
  await search(page, "G001");
  await expect(page.getByRole("status")).toContainText("Nothing found for “G001”");
  const res = await page.goto(`/admin/browse/learners/${green!.id}`);
  expect(res?.status()).toBe(404);
  const cls = await page.goto(`/admin/browse/classes/${b.secondClass!.classId}`);
  expect(cls?.status()).toBe(404);
});
