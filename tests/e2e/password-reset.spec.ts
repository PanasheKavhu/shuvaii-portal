import { expect, test, type Page } from "@playwright/test";
import { createLoneUser, PASSWORD, resetEmailFor, signIn } from "./helpers";

const NEW_PASSWORD = "msasa-new-pass-2026";

const formError = (page: Page) => page.locator("form").getByRole("alert");

async function requestReset(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset email" }).click();
  await expect(page.getByRole("status")).toContainText("we have sent it a link and a 6-digit code");
}

/**
 * Submits a code and waits until React has finished the action (it clears
 * the field when done), so a stale error is never read.
 */
async function submitCode(page: Page, code: string) {
  const field = page.getByLabel("Code from the email");
  await field.fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(field).toHaveValue("");
}

async function chooseNewPassword(page: Page) {
  await expect(page).toHaveURL("/reset-password");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  // No school yet, so the person lands on the "no access" page, signed in.
  await expect(page).toHaveURL("/no-access");
}

async function expectOnlyNewPasswordWorks(page: Page, email: string) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await signIn(page, email, PASSWORD);
  await expect(formError(page)).toHaveText("Email or password is incorrect.");
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL("/no-access");
}

test("a staff member resets their password with the emailed link", async ({ page }) => {
  const email = await createLoneUser("reset-link");
  await requestReset(page, email);

  const { tokenHash } = await resetEmailFor(email);
  const link = `/auth/confirm?token_hash=${tokenHash}&type=recovery`;
  await page.goto(link);
  await chooseNewPassword(page);
  await expectOnlyNewPasswordWorks(page, email);

  // The link works once.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await page.goto(link);
  await expect(page).toHaveURL("/forgot-password?link=invalid");
  await expect(page.getByText("That reset link has expired or was already used.")).toBeVisible();
});

test("a staff member resets their password with the emailed code", async ({ page }) => {
  const email = await createLoneUser("reset-code");
  await requestReset(page, email);
  const { code } = await resetEmailFor(email);

  await submitCode(page, code === "000000" ? "111111" : "000000");
  await expect(formError(page)).toHaveText(
    "That code is wrong or has expired. Check the latest email, or ask for a new one.",
  );

  await page.getByLabel("Code from the email").fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await chooseNewPassword(page);
  await expectOnlyNewPasswordWorks(page, email);
});

test("an unknown email gets the same reply, and wrong codes lock out", async ({ page }) => {
  const email = `nobody-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.spportal.test`;
  await requestReset(page, email);

  for (let i = 1; i <= 4; i++) {
    await submitCode(page, `00000${i}`);
    await expect(formError(page)).toContainText("That code is wrong or has expired.");
  }
  await submitCode(page, "000005");
  await expect(formError(page)).toHaveText("Too many failed attempts. Try again in 15 minutes.");
});

test("the new-password page needs a reset link or code", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL("/forgot-password");

  // Being signed in is not enough.
  const email = await createLoneUser("reset-guard");
  await signIn(page, email);
  await expect(page).toHaveURL("/no-access");
  await page.goto("/reset-password");
  await expect(page).toHaveURL("/forgot-password");
});
