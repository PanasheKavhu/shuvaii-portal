import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "sp-portal-demo-2026";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test("each school's colours are applied from the database", async ({ page }) => {
  // seed/schools.csv: Msasa primary #0B5FA5, Kudzai primary #1B7F5C.
  await signIn(page, "pzimu@msasa.demo.spportal.test");
  await expect(page).toHaveURL("/head");
  expect(await cssVar(page, "--primary")).toBe("#0b5fa5");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");

  await signIn(page, "rchirw@kudzai.demo.spportal.test");
  await expect(page).toHaveURL("/head");
  expect(await cssVar(page, "--primary")).toBe("#1b7f5c");
});

test("dark mode can be chosen and is remembered", async ({ page }) => {
  await page.goto("/sign-in");
  const html = page.locator("html");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
});
