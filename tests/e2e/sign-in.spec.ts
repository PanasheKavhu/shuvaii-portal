import { expect, test, type Page } from "@playwright/test";

// Seed users (seed/profiles.csv); the password is the published local demo
// password from scripts/seed.mjs.
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "sp-portal-demo-2026";
const HEAD = "pzimu@msasa.demo.spportal.test";
const TEACHER = "rchik@msasa.demo.spportal.test";
const ADMIN = "gtembo@msasa.demo.spportal.test";
const RELIEF_TEACHER = "relief1@demo.spportal.test";
const PLATFORM_ADMIN = "platform@demo.spportal.test";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const formError = (page: Page) => page.locator("form").getByRole("alert");
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("a head lands on the head's office and sees only their menu", async ({ page }) => {
  await signIn(page, HEAD);
  await expect(page).toHaveURL("/head");
  await expect(page.getByRole("heading", { name: "Head's office" })).toBeVisible();
  await expect(page.getByTestId("school-name")).toHaveText("Msasa Demo High School");
  await expect(mainNav(page).getByRole("link")).toHaveText([
    "Head's office",
    "Marks",
    "Completion",
    "Audit log",
  ]);
  await expect(page.getByRole("contentinfo")).toHaveText("Implemented by Panashe and Shuvai 2026");
});

test("a school admin lands on the admin area", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await expect(mainNav(page).getByRole("link")).toHaveText([
    "School admin",
    "Marks",
    "Completion",
    "Audit log",
  ]);
});

test("a teacher is told 'not allowed' on admin and head pages", async ({ page }) => {
  await signIn(page, TEACHER);
  await expect(page).toHaveURL("/teaching");
  await expect(mainNav(page).getByRole("link")).toHaveText(["My classes", "Completion"]);

  for (const path of ["/admin", "/head", "/platform"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
  }
});

test("a teacher in two schools chooses a school and can switch", async ({ page }) => {
  await signIn(page, RELIEF_TEACHER);
  await expect(page).toHaveURL("/select-school");

  await page.getByRole("button", { name: /Kudzai Demo Primary School/ }).click();
  await expect(page).toHaveURL("/teaching");
  await expect(page.getByTestId("school-name")).toHaveText("Kudzai Demo Primary School");

  await page.getByRole("link", { name: "Switch school" }).click();
  await expect(page).toHaveURL("/select-school");
  await page.getByRole("button", { name: /Msasa Demo High School/ }).click();
  await expect(page).toHaveURL("/teaching");
  await expect(page.getByTestId("school-name")).toHaveText("Msasa Demo High School");
});

test("a platform admin lands on the platform console", async ({ page }) => {
  await signIn(page, PLATFORM_ADMIN);
  await expect(page).toHaveURL("/platform");
  await expect(mainNav(page).getByRole("link")).toHaveText(["Platform"]);
});

test("a wrong password shows an error and keeps the email", async ({ page }) => {
  await signIn(page, HEAD, "not-the-password");
  await expect(formError(page)).toHaveText("Email or password is incorrect.");
  await expect(page.getByLabel("Email")).toHaveValue(HEAD);
});

test("five failed attempts block further attempts", async ({ page }, testInfo) => {
  // A fresh address per run, so the lockout never affects other tests.
  const email = `lockout-${testInfo.project.name}-${Date.now()}@demo.spportal.test`;
  for (let i = 1; i <= 4; i++) {
    await signIn(page, email, `wrong-${i}`);
    await expect(formError(page)).toHaveText("Email or password is incorrect.");
  }
  await signIn(page, email, "wrong-5");
  await expect(formError(page)).toHaveText("Too many failed attempts. Try again in 15 minutes.");
  await signIn(page, email, "wrong-6");
  await expect(formError(page)).toContainText("Too many failed attempts.");
});

test("signed-out visitors are sent to sign in, and sign out works", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/sign-in");

  await signIn(page, TEACHER);
  await expect(page).toHaveURL("/teaching");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await page.goto("/teaching");
  await expect(page).toHaveURL("/sign-in");
});
