import { expect, test } from "@playwright/test";

test("home page loads with the SP Portal title, sign in link and footer", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBe(true);
  await expect(page).toHaveTitle("SP Portal");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toHaveText("Implemented by Panashe and Shuvai 2026");
});
