import { expect, test, type Browser, type Page } from "@playwright/test";
import { PLATFORM_ADMIN, createMarksClass, signIn } from "./helpers";

// Automatic learner numbers (D64), at 360 px (the mobile project) and on a
// desktop screen. The test makes its own school ("Setup School <stamp>",
// so its numbers start SET + the year), switches the feature on in the
// console, then adds learners without numbers by hand and by import.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

async function signedInPage(browser: Browser, page: Page, email: string) {
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const p = await context.newPage();
  await signIn(p, email);
  return p;
}

const year = String(new Date().getFullYear()).slice(-2);

test("with automatic learner numbers on, learners added without a number get the next one", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("auton", { learners: 0 });

  // Off by default: the add form still needs a number.
  const admin = await signedInPage(browser, page, school.adminEmail);
  await expect(admin).toHaveURL("/admin");
  await admin.goto("/admin/people/learners/new");
  const form = admin.getByRole("form", { name: "Add a learner" });
  await form.getByLabel("First name").fill("Rudo");
  await form.getByLabel("Last name").fill("Moyo");
  await form.getByRole("button", { name: "Add learner" }).click();
  await expect(form.getByRole("alert").first()).toContainText("Enter the learner number");

  // A super admin switches it on for this school.
  const platform = await signedInPage(browser, page, PLATFORM_ADMIN);
  await platform.goto(`/platform/schools/${school.schoolId}`);
  await platform.getByRole("button", { name: "Switch automatic learner numbers on" }).click();
  await expect(platform.getByText("Automatic learner numbers switched on.")).toBeVisible();
  await platform.context().close();

  // By hand: blank, with the hint.
  await admin.goto("/admin/people/learners/new");
  await expect(
    admin.getByText("Leave it blank and the portal gives the next number."),
  ).toBeVisible();
  await form.getByLabel("First name").fill("Rudo");
  await form.getByLabel("Last name").fill("Moyo");
  await form.getByRole("button", { name: "Add learner" }).click();
  await expect(admin.getByRole("heading", { name: "Rudo Moyo" })).toBeVisible();
  await expect(admin.getByText(`SET${year}0001`, { exact: true })).toBeVisible();

  // By import: no learner_number column at all, and a number of the school's own kept.
  await admin.goto("/admin/people/import");
  await expect(admin.getByText("Learner numbers are optional for this school")).toBeVisible();
  const upload = admin.getByRole("form", { name: "Import learners" });
  await upload.getByLabel("Learners file").setInputFiles({
    name: "no-numbers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "learner_number,first_name,last_name,class",
        ",Tino,Moyo,4 Blue",
        "OWN-1,Kuda,Moyo,4 Blue",
        ",Chipo,Banda,4 Blue",
      ].join("\n"),
    ),
  });
  await upload.getByRole("button", { name: /Upload and check/ }).click();
  const summary = admin.getByRole("list", { name: "What will be imported" });
  await expect(summary).toContainText("3 learners");
  await expect(summary).toContainText("2 learners without a number will get the next one");
  await admin.getByRole("button", { name: "Import now" }).click();
  await expect(admin.getByRole("heading", { name: "Imported", exact: true })).toBeVisible();

  await admin.goto("/admin/people/learners?status=all");
  const list = admin.getByRole("list", { name: "Learners" });
  await expect(list).toContainText(`SET${year}0002`);
  await expect(list).toContainText(`SET${year}0003`);
  await expect(list).toContainText("OWN-1");
  await admin.context().close();
});
