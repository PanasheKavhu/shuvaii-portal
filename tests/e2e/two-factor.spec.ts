import { expect, test, type Page } from "@playwright/test";
import {
  MSASA_TEACHER,
  PASSWORD,
  PLATFORM_ADMIN,
  apiSignIn,
  createEmptySchool,
  setUpTwoFactor,
  signIn,
} from "./helpers";
import { expectNoSideScroll } from "./report-helpers";
import { totpCode, totpSecretFor, wrongTotpCode } from "./totp";

// Two-factor sign in for super admins, school admins and heads (SPEC
// section 5, D54), at 360 px. Each test makes its own school, so its admin
// starts with no authenticator app and nothing here touches the seed users'.

test.use({ viewport: { width: 360, height: 780 } });

const formError = (page: Page) => page.locator("form").getByRole("alert");

async function passwordStep(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Submits a code at /two-factor and waits for the answer. */
async function enterCode(page: Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

/**
 * Submits a code that is refused. The form clears once the answer is in,
 * so the next code is not typed while this one is still being checked.
 */
async function refusedCode(page: Page, code: string) {
  await enterCode(page, code);
  await expect(page.getByLabel("6-digit code")).toHaveValue("");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
}

test("a school admin must set up two-factor first, then signs in again with a code", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const school = await createEmptySchool("tfa-enrol");

  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor/setup");
  await expect(page.getByRole("heading", { name: "Set up two-factor sign in" })).toBeVisible();
  await expectNoSideScroll(page);

  // Nothing else opens first, by the menu or by address.
  for (const path of ["/admin", "/admin/people", "/marks", "/news", "/"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL("/two-factor/setup");
  }

  // QR code and the key to type by hand, then a code confirms it.
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const secret = (await page.getByTestId("setup-key").innerText()).replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expectNoSideScroll(page);
  await page.getByLabel("6-digit code").fill(wrongTotpCode(secret));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(formError(page)).toHaveText(
    "That code is not right. Try the newest code in your app.",
  );
  await expect(page.getByLabel("6-digit code")).toHaveValue("");
  await page.getByLabel("6-digit code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Confirm" }).click();

  // Ten recovery codes, shown once.
  const codes = page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  for (const code of await codes.allInnerTexts()) expect(code).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
  await expectNoSideScroll(page);
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await page.getByLabel("I have saved my recovery codes").check();
  await cont.click();
  await expect(page).toHaveURL("/admin");
  await page.goto("/two-factor/setup");
  await expect(page.getByRole("list", { name: "Recovery codes" })).toHaveCount(0);

  // Next time: password, then the code from the app.
  await page.goto("/admin");
  await signOut(page);
  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor");
  await expect(page.getByRole("heading", { name: "Enter your sign-in code" })).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL("/two-factor");
  await expectNoSideScroll(page);
  await enterCode(page, totpCode(secret));
  await expect(page).toHaveURL("/admin");
});

test("wrong codes are refused and share the password lockout", async ({ page }) => {
  test.setTimeout(90_000);
  const school = await createEmptySchool("tfa-lock");
  await apiSignIn(school.adminEmail); // sets up their app
  const secret = totpSecretFor(school.adminEmail)!;

  // Two wrong passwords, then the right one: on to the code.
  for (const wrong of ["wrong-1", "wrong-2"]) {
    await passwordStep(page, school.adminEmail, wrong);
    await expect(formError(page)).toHaveText("Email or password is incorrect.");
  }
  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor");

  // Two wrong codes are refused; the third is the fifth failure.
  for (let i = 0; i < 2; i++) {
    await refusedCode(page, wrongTotpCode(secret));
    await expect(formError(page)).toHaveText(
      "That code is not right. Try the newest code in your app.",
    );
  }
  await enterCode(page, wrongTotpCode(secret));
  await expect(formError(page)).toHaveText("Too many failed attempts. Try again in 15 minutes.");

  // Now even the right code, a recovery code and the password wait.
  await enterCode(page, totpCode(secret));
  await expect(formError(page)).toContainText("Too many failed attempts.");
  await expect(page).toHaveURL("/two-factor");
  await page.goto("/two-factor/recovery");
  await page.getByLabel("Recovery code").fill("ABCDE-FGHJK");
  await page.getByRole("button", { name: "Sign in with this code" }).click();
  await expect(formError(page)).toContainText("Too many failed attempts.");
  await signOut(page);
  await passwordStep(page, school.adminEmail);
  await expect(formError(page)).toContainText("Too many failed attempts.");
});

test("a recovery code works once and makes the person set up their app again", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createEmptySchool("tfa-recover");
  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor/setup");
  const codes = await setUpTwoFactor(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await signOut(page);

  // Lost phone: a recovery code (typed loosely) signs in.
  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor");
  await page.getByRole("link", { name: "No phone? Use a recovery code" }).click();
  await expect(page).toHaveURL("/two-factor/recovery");
  await expectNoSideScroll(page);
  await page.getByLabel("Recovery code").fill(codes[0]!.toLowerCase().replace("-", " "));
  await page.getByRole("button", { name: "Sign in with this code" }).click();

  // The old app is gone: set it up again before anything else.
  await expect(page).toHaveURL("/two-factor/setup?recovered=1");
  await expect(page.getByText("You signed in with a recovery code")).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL("/two-factor/setup");
  const newCodes = await setUpTwoFactor(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  expect(newCodes).not.toContain(codes[1]);
  await signOut(page);

  // The used code, and the rest of the old set, no longer work.
  await passwordStep(page, school.adminEmail);
  await expect(page).toHaveURL("/two-factor");
  await page.goto("/two-factor/recovery");
  for (const old of [codes[0]!, codes[1]!]) {
    await page.getByLabel("Recovery code").fill(old);
    await page.getByRole("button", { name: "Sign in with this code" }).click();
    await expect(page.getByLabel("Recovery code")).toHaveValue("");
    await expect(formError(page)).toHaveText(
      "That recovery code is not right or was already used.",
    );
  }
  await page.goto("/two-factor");
  await enterCode(page, totpCode(totpSecretFor(school.adminEmail)!));
  await expect(page).toHaveURL("/admin");
});

test("a teacher is never asked for a second step", async ({ page }) => {
  await signIn(page, MSASA_TEACHER);
  await expect(page).toHaveURL("/teaching");
  for (const path of ["/two-factor", "/two-factor/setup", "/two-factor/recovery"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL("/teaching");
  }
  await expect(page.getByText(/two-factor|authenticator/i)).toHaveCount(0);
});

test("a super admin resets a school admin's two-factor; they are signed out and set it up again", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const school = await createEmptySchool("tfa-reset");

  // The school admin is signed in, past the second step, on another device.
  const adminPage = await (
    await browser.newContext({ viewport: { width: 360, height: 780 } })
  ).newPage();
  await signIn(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/admin");

  await signIn(page, PLATFORM_ADMIN);
  await page.goto(`/platform/schools/${school.schoolId}`);
  const people = page.getByRole("list", { name: "Two-factor status of admins and heads" });
  await expect(people).toContainText(school.adminName);
  await expect(people).toContainText("Authenticator app set up");
  await expectNoSideScroll(page);
  await people
    .getByRole("button", { name: `Reset two-factor sign in for ${school.adminName}` })
    .click();
  await people.getByRole("button", { name: "Yes, reset" }).click();
  await expect(people.getByRole("status")).toHaveText(
    "Reset. They will set up their authenticator app again when they next sign in.",
  );
  await page.reload();
  await expect(people).toContainText("Not set up yet");
  await expect(people).toContainText("last reset");

  // Their open session has ended; signing in again needs a new app.
  await adminPage.goto("/admin");
  await expect(adminPage).toHaveURL("/sign-in");
  await passwordStep(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/two-factor/setup");
  await setUpTwoFactor(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/admin");

  // The reset is in the school's audit log, and the super admin cannot reset their own.
  await adminPage.goto("/admin/audit");
  await expect(adminPage.getByText(/reset .+ two-factor sign in/)).toBeVisible();
  await page.goto("/platform");
  await expect(page.getByRole("list", { name: "Two-factor status of super admins" })).toContainText(
    "This is you",
  );
});
