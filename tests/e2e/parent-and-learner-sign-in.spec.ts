import { expect, test, type Page } from "@playwright/test";
import {
  MSASA,
  MSASA_ADMIN,
  PASSWORD,
  createFamily,
  createLoneUser,
  resetEmailFor,
  setLearnerStatus,
  signIn,
} from "./helpers";

// SPEC US-1.2 (learner sign in with learner number and PIN), US-1.3 (parent
// accounts from a one-time code) and US-1.7 (parents reset by email,
// learners by an admin), on a phone-sized screen. Each test makes its own
// learners and guardian in the seed school Msasa.
test.use({ viewport: { width: 360, height: 780 } });
test.describe.configure({ timeout: 120_000 });

const SEED_LEARNER = { number: "msh260001", pin: "246810", name: "Tawanda" };

const formError = (page: Page) => page.locator("form").getByRole("alert");

/** Opens the learner sign-in page afresh and signs in. */
async function learnerSignIn(page: Page, number: string, pin: string) {
  await page.goto("/sign-in/learner");
  await page.getByLabel("School").selectOption({ label: MSASA.name });
  await page.getByLabel("Learner number").fill(number);
  await page.getByLabel("PIN", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Tries another PIN on the same page and waits until React has finished the
 * action (it clears the PIN field), so a stale error is never read.
 */
async function submitLearnerSignIn(page: Page, pin: string) {
  const pinField = page.getByLabel("PIN", { exact: true });
  await pinField.fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(pinField).toHaveValue("");
}

/** The one-time secret a form shows after its button is pressed. */
async function readSecret(page: Page, formName: string, button: string): Promise<string> {
  const form = page.getByRole("form", { name: formName });
  await form.getByRole("button", { name: button }).click();
  const value = form.getByRole("status").locator(".font-mono");
  await expect(value).toBeVisible();
  return (await value.textContent())!.trim();
}

async function adminSetsPin(page: Page, learnerId: string, button: "Create PIN" | "Reset PIN") {
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/people/learners/${learnerId}`);
  const pin = await readSecret(page, "Learner PIN", button);
  expect(pin).toMatch(/^\d{6}$/);
  return pin;
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
}

test("a learner signs in with their learner number and PIN", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Learner? Sign in with your learner number" }).click();
  await expect(page).toHaveURL("/sign-in/learner");

  await learnerSignIn(page, SEED_LEARNER.number, "135792");
  await expect(formError(page)).toHaveText("Learner number or PIN is incorrect.");

  await learnerSignIn(page, SEED_LEARNER.number, SEED_LEARNER.pin);
  await expect(page).toHaveURL("/my-reports");
  await expect(page.getByRole("heading", { name: "My reports" })).toBeVisible();
  await expect(page.getByText(`Welcome, ${SEED_LEARNER.name}.`)).toBeVisible();
  await expect(page.getByRole("link", { name: "School admin" })).toHaveCount(0);

  // A learner cannot open staff areas.
  const response = await page.goto("/admin/people");
  expect(response?.status()).toBe(403);
});

test("an admin gives a learner a PIN, and the learner must choose their own", async ({
  browser,
  page,
}) => {
  const { learners } = await createFamily("pin");
  const learner = learners[0];
  const firstPin = await adminSetsPin(page, learner.id, "Create PIN");

  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();
  await learnerSignIn(learnerPage, learner.number.toLowerCase(), firstPin);
  await expect(learnerPage).toHaveURL("/change-pin");
  await expect(
    learnerPage.getByText("Your school set a PIN for you. Choose your own"),
  ).toBeVisible();

  // Nothing else opens until they do.
  await learnerPage.goto("/my-reports");
  await expect(learnerPage).toHaveURL("/change-pin");

  await learnerPage.getByLabel("New PIN").fill("123456");
  await learnerPage.getByLabel("Confirm PIN").fill("123456");
  await learnerPage.getByRole("button", { name: "Save PIN and continue" }).click();
  await expect(formError(learnerPage)).toContainText("too easy to guess");

  const ownPin = "482913";
  await learnerPage.getByLabel("New PIN").fill(ownPin);
  await learnerPage.getByLabel("Confirm PIN").fill(ownPin);
  await learnerPage.getByRole("button", { name: "Save PIN and continue" }).click();
  await expect(learnerPage).toHaveURL("/my-reports");
  await expect(learnerPage.getByText(`Welcome, ${learner.firstName}.`)).toBeVisible();

  // Only the PIN they chose works now.
  await signOut(learnerPage);
  await learnerSignIn(learnerPage, learner.number, firstPin);
  await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");
  await learnerSignIn(learnerPage, learner.number, ownPin);
  await expect(learnerPage).toHaveURL("/my-reports");
  await signOut(learnerPage);

  // Forgot it: the admin resets it (US-1.7 for learners), and the old one stops working.
  await page.reload();
  const resetPin = await readSecret(page, "Learner PIN", "Reset PIN");
  await learnerSignIn(learnerPage, learner.number, ownPin);
  await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");
  await learnerSignIn(learnerPage, learner.number, resetPin);
  await expect(learnerPage).toHaveURL("/change-pin");
  await learnerContext.close();
});

test("a learner marked as left can no longer sign in", async ({ browser, page }) => {
  const family = await createFamily("lft");
  const learner = family.learners[0];
  const pin = await adminSetsPin(page, learner.id, "Create PIN");

  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();
  await learnerSignIn(learnerPage, learner.number, pin);
  await expect(learnerPage).toHaveURL("/change-pin");
  await learnerContext.clearCookies();

  await setLearnerStatus(learner.id, "left");
  await learnerSignIn(learnerPage, learner.number, pin);
  await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");

  // Back at school: the same PIN works again.
  await setLearnerStatus(learner.id, "active");
  await learnerSignIn(learnerPage, learner.number, pin);
  await expect(learnerPage).toHaveURL("/change-pin");
  await learnerContext.close();
});

test("wrong PINs lock a learner out like staff", async ({ browser, page }) => {
  const { learners } = await createFamily("lock");
  const learner = learners[0];
  const pin = await adminSetsPin(page, learner.id, "Create PIN");
  // The learner uses their own browser: signing the admin out here would
  // sign them out in every parallel test too.
  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();

  const wrong = pin === "135792" ? "135794" : "135792";
  await learnerSignIn(learnerPage, learner.number, wrong);
  await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");
  for (let i = 0; i < 3; i++) {
    await submitLearnerSignIn(learnerPage, wrong);
    await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");
  }
  await submitLearnerSignIn(learnerPage, wrong);
  await expect(formError(learnerPage)).toHaveText(
    "Too many failed attempts. Try again in 15 minutes.",
  );

  // Locked: even the right PIN is refused.
  await submitLearnerSignIn(learnerPage, pin);
  await expect(formError(learnerPage)).toContainText("Too many failed attempts.");

  // An unknown learner number gets the same answer as a wrong PIN.
  await learnerPage.getByLabel("Learner number").fill(`${learner.number}X`);
  await submitLearnerSignIn(learnerPage, pin);
  await expect(formError(learnerPage)).toHaveText("Learner number or PIN is incorrect.");
  await learnerContext.close();
});

test("a parent sets up an account with a one-time code and sees both children", async ({
  browser,
  page,
}) => {
  const family = await createFamily("par");
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/people/learners/${family.learners[0].id}`);
  const code = await readSecret(
    page,
    `Parent code for ${family.guardianName}`,
    "Make a parent code",
  );
  expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  const parentContext = await browser.newContext();
  const parent = await parentContext.newPage();
  await parent.goto("/sign-in");
  await parent
    .getByRole("link", { name: "Parent with a code from the school? Set up your account" })
    .click();
  await expect(parent).toHaveURL("/join");
  await parent.getByLabel("Code from the school").fill(code.toLowerCase());
  await parent.getByRole("button", { name: "Continue" }).click();

  await expect(parent.getByRole("heading", { name: `Join ${MSASA.name}` })).toBeVisible();
  await expect(
    parent.getByText(`This code is for ${family.guardianName}. It links your 2 children`),
  ).toBeVisible();
  await expect(parent.getByLabel("Your full name")).toHaveValue(family.guardianName);

  const email = `parent-${family.lastName.toLowerCase()}@demo.spportal.test`;
  await parent.getByLabel("Email").fill(email);
  await parent.getByLabel("Password", { exact: true }).fill("short");
  await parent.getByLabel("Confirm password").fill("short");
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent.getByText("Use at least 8 characters.")).toBeVisible();

  await parent.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await parent.getByLabel("Confirm password").fill(PASSWORD);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL("/children");
  const children = parent.getByRole("list", { name: "Your children" });
  for (const learner of family.learners) {
    await expect(children).toContainText(`${learner.firstName} ${family.lastName}`);
  }

  // The code works once.
  await signOut(parent);
  await parent.goto(`/join?code=${code}`);
  await expect(parent.locator("main").getByRole("alert")).toHaveText(
    "This code was already used. If you set up the account, sign in with your email and password.",
  );

  // US-1.7: the parent resets their password by email like staff.
  await parent.goto("/forgot-password");
  await parent.getByLabel("Email").fill(email);
  await parent.getByRole("button", { name: "Send reset email" }).click();
  await expect(parent.getByRole("status")).toContainText("we have sent it a link");
  const { tokenHash } = await resetEmailFor(email);
  await parent.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
  await expect(parent).toHaveURL("/reset-password");
  await parent.getByLabel("New password").fill("parent-new-pass-2026");
  await parent.getByLabel("Confirm password").fill("parent-new-pass-2026");
  await parent.getByRole("button", { name: "Save new password" }).click();
  await expect(parent).toHaveURL("/children");
  await expect(parent.getByRole("list", { name: "Your children" })).toBeVisible();

  // The admin sees the guardian now has an account and offers no code.
  await page.reload();
  await expect(page.getByText(`${family.guardianName} has a parent account`)).toBeVisible();
  await expect(page.getByRole("button", { name: /parent code/ })).toHaveCount(0);
  await parentContext.close();
});

test("an old, unknown or replaced code is rejected with a clear message", async ({
  browser,
  page,
}) => {
  const family = await createFamily("old");
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/people/learners/${family.learners[1].id}`);
  const formName = `Parent code for ${family.guardianName}`;
  const first = await readSecret(page, formName, "Make a parent code");
  await page.reload();
  await expect(page.getByText("A parent code is waiting to be used.")).toBeVisible();
  const second = await readSecret(page, formName, "Make a new parent code");
  expect(second).not.toBe(first);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/join?code=${first}`);
  await expect(visitor.locator("main").getByRole("alert")).toHaveText(
    "This code has expired. Ask the school office for a new one.",
  );
  await visitor.goto("/join?code=2222-3333-4444");
  await expect(visitor.locator("main").getByRole("alert")).toHaveText(
    "We could not find that code. Check it and try again.",
  );
  await visitor.goto(`/join?code=${second}`);
  await expect(visitor.getByRole("heading", { name: `Join ${MSASA.name}` })).toBeVisible();
});

test("someone already signed in adds the children to their own account", async ({
  browser,
  page,
}) => {
  const family = await createFamily("own");
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/people/learners/${family.learners[0].id}`);
  const code = await readSecret(
    page,
    `Parent code for ${family.guardianName}`,
    "Make a parent code",
  );

  const email = await createLoneUser("own-parent");
  const person = await (await browser.newContext()).newPage();
  await signIn(person, email);
  await expect(person).toHaveURL("/no-access");
  await person.goto(`/join?code=${code}`);
  await expect(person.getByText("You are signed in as")).toBeVisible();
  await person.getByRole("button", { name: "Add to my account" }).click();
  await expect(person).toHaveURL("/children");
  await expect(person.getByRole("list", { name: "Your children" })).toContainText(
    `${family.learners[1].firstName} ${family.lastName}`,
  );
});
