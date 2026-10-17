import { expect, test, type Browser, type Page } from "@playwright/test";
import { PLATFORM_ADMIN, createEmptySchool, signIn } from "./helpers";

// Suspending a school in the console (D63), at 360 px (the mobile project)
// and on a desktop screen. The test makes its own school, so the seed
// schools other tests use are never suspended.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

async function signedInPage(browser: Browser, page: Page, email: string) {
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const p = await context.newPage();
  await signIn(p, email);
  return p;
}

/** Whether each public picker (learner sign in, privacy notice) offers the school. */
async function expectListed(page: Page, schoolName: string, listed: boolean) {
  for (const [path, label] of [
    ["/sign-in/learner", "School"],
    ["/privacy", "Your school"],
  ] as const) {
    await page.goto(path);
    const names = await page.getByLabel(label).locator("option").allTextContents();
    expect(names.includes(schoolName), `${schoolName} listed on ${path}`).toBe(listed);
  }
}

test("a super admin suspends a school: it leaves the sign-in list and its staff are shut out until it is reactivated", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const school = await createEmptySchool("susp");
  await expectListed(page, school.schoolName, true);

  const admin = await signedInPage(browser, page, PLATFORM_ADMIN);
  await expect(admin).toHaveURL("/platform");
  await admin.goto(`/platform/schools/${school.schoolId}`);
  const form = admin.getByRole("form", { name: "School status" });
  await expect(form.getByText("Active", { exact: true })).toBeVisible();

  // Suspending needs the tick.
  await form.getByRole("button", { name: "Suspend school" }).click();
  await expect(form.getByRole("alert")).toHaveText("Tick the box to confirm.");
  await form
    .getByLabel(`Shut everyone at ${school.schoolName} out until it is reactivated`)
    .check();
  await form.getByRole("button", { name: "Suspend school" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "School suspended. It is hidden and nobody in it can sign in to it.",
  );
  await expect(form.getByText("Suspended", { exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: "Reactivate school" })).toBeVisible();

  // Gone from the public lists, and its staff get nothing.
  await expectListed(page, school.schoolName, false);
  const teacher = await signedInPage(browser, page, school.teacherEmail);
  await expect(teacher).toHaveURL("/no-access");
  expect((await teacher.goto("/teaching"))?.status()).not.toBe(200);
  await teacher.context().close();

  // Reactivating brings it all back.
  await form.getByRole("button", { name: "Reactivate school" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "School reactivated. Everything is back as it was.",
  );
  await expectListed(page, school.schoolName, true);
  const back = await signedInPage(browser, page, school.teacherEmail);
  await expect(back).toHaveURL("/teaching");
  await back.context().close();
  await admin.context().close();
});
