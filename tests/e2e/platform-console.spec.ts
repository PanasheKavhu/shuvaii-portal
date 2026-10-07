import { globSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  KUDZAI,
  MSASA,
  MSASA_ADMIN,
  MSASA_TEACHER,
  PLATFORM_ADMIN,
  cssVar,
  auditEventsAs,
  inviteTokenFor,
  inviteTokensFor,
  mainNav,
  signIn,
} from "./helpers";

const LOGO = path.join(__dirname, "fixtures", "logo.png");

test("super admin creates a school, brands it and invites its admin, who sees the theme", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `E2E School ${suffix}`;
  const adminEmail = `admin-${suffix}@e2e.spportal.test`;

  // Create the school (US-10.1).
  await signIn(page, PLATFORM_ADMIN);
  await expect(page).toHaveURL("/platform");
  await page.getByRole("link", { name: "New school" }).click();
  await page.getByLabel("School name").fill(name);
  await expect(page.getByLabel("Slug")).toHaveValue(`e2e-school-${suffix}`);
  await page.getByLabel("Stage").selectOption("primary");
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/\/platform\/schools\/[0-9a-f-]{36}$/);
  const schoolId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // A colour failing AA is rejected with a suggestion (US-1.5).
  const colours = page.getByRole("region", { name: "Colours" });
  const primary = colours.getByLabel("Primary colour", { exact: true });
  await primary.fill("#7fb3e0");
  await page.getByLabel("Accent colour", { exact: true }).fill("#ffb703");
  await page.getByRole("button", { name: "Save colours" }).click();
  await expect(page.getByText(/at least 4.5:1 is needed\. Try #[0-9a-f]{6}/)).toBeVisible();
  await page.getByRole("button", { name: /^Use #[0-9a-f]{6}$/ }).click();
  await expect(primary).not.toHaveValue("#7fb3e0");
  await expect(page.getByText(/passes AA/).first()).toBeVisible();

  // A passing pair saves.
  await primary.fill("#7a1fa2");
  await page.getByRole("button", { name: "Save colours" }).click();
  await expect(colours.getByRole("status")).toHaveText("Colours saved.");

  // Logo upload.
  await page.getByLabel("Logo image").setInputFiles(LOGO);
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByRole("region", { name: "Logo" }).getByRole("status")).toHaveText(
    "Logo uploaded.",
  );
  await expect(page.getByRole("img", { name: `${name} logo` })).toHaveAttribute(
    "src",
    new RegExp(`/school-branding/${schoolId}/logo-\\d+\\.png$`),
  );

  // First school-admin invite.
  await page.getByLabel("Full name").fill("Tariro Moyo");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("list", { name: "School admins" })).toContainText(
    "Invite sent, not accepted yet",
  );

  // The invitee accepts from the email link and sets a password.
  const token = await inviteTokenFor(adminEmail);
  const inviteeContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: page.viewportSize(),
  });
  const invitee = await inviteeContext.newPage();
  await invitee.goto(`/auth/confirm?token_hash=${token}&type=invite`);
  await expect(invitee).toHaveURL("/welcome");
  await invitee.getByLabel("New password").fill("harare-e2e-2026");
  await invitee.getByLabel("Confirm password").fill("harare-e2e-2026");
  await invitee.getByRole("button", { name: "Set password and continue" }).click();

  // The school's pages use the new theme and logo, with no code change.
  await expect(invitee).toHaveURL("/admin");
  await expect(invitee.getByTestId("school-name")).toHaveText(name);
  expect(await cssVar(invitee, "--primary")).toBe("#7a1fa2");
  await expect(invitee.getByRole("img", { name: `${name} logo` })).toBeVisible();
  await expect(invitee.getByRole("contentinfo")).toHaveText(
    "Implemented by Panashe and Shuvai 2026",
  );

  // Change the colour again: the admin's next page load picks it up.
  await page.reload();
  await expect(page.getByRole("list", { name: "School admins" })).toContainText("Active");
  await primary.fill("#9a3412");
  await page.getByRole("button", { name: "Save colours" }).click();
  await expect(colours.getByRole("status")).toHaveText("Colours saved.");
  await invitee.reload();
  await expect.poll(() => cssVar(invitee, "--primary")).toBe("#9a3412");

  // A used link is rejected.
  await inviteeContext.clearCookies();
  await invitee.goto(`/auth/confirm?token_hash=${token}&type=invite`);
  await expect(invitee).toHaveURL("/sign-in?invite=invalid");
  await expect(invitee.getByText(/expired or was already used/)).toBeVisible();
  await inviteeContext.close();
});

test("a school admin cannot open the super-admin console", async ({ page }) => {
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await expect(mainNav(page).getByRole("link", { name: "Platform" })).toHaveCount(0);

  for (const target of [
    "/platform",
    "/platform/schools/new",
    `/platform/schools/${MSASA.id}`,
    `/platform/schools/${KUDZAI.id}`,
  ]) {
    const res = await page.goto(target);
    expect(res?.status(), target).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save colours|Create school/ })).toHaveCount(0);
  }
});

/** Every page route in the app, with dynamic segments filled with school B's id. */
function allPagePaths(): string[] {
  const appDir = path.join(__dirname, "..", "..", "src", "app");
  return globSync("**/page.tsx", { cwd: appDir })
    .map((file) =>
      `/${path.dirname(file).split(path.sep).join("/")}`
        .replace(/\/\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]/g, KUDZAI.id)
        .replace(/\/\.$/, "/"),
    )
    .map((p) => p.replace(/\/$/, "") || "/")
    .sort();
}

test("a teacher in school A cannot see school B's data through any page", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const paths = allPagePaths();
  expect(paths).toContain("/platform/schools/" + KUDZAI.id);
  expect(paths).toContain("/teaching");

  await signIn(page, MSASA_TEACHER);
  await expect(page).toHaveURL("/teaching");

  const leaks = [KUDZAI.name, KUDZAI.slug, KUDZAI.motto, KUDZAI.primary];
  const check = async (target: string) => {
    await page.goto(target);
    const html = (await page.content()).toLowerCase();
    for (const leak of leaks)
      expect(html, `${target} shows "${leak}"`).not.toContain(leak.toLowerCase());
  };

  for (const target of paths) await check(target);

  // Pointing the school cookie at school B changes nothing.
  await context.addCookies([{ name: "sp_school", value: KUDZAI.id, url: "http://localhost:3000" }]);
  for (const target of paths) await check(target);
  await page.goto("/teaching");
  await expect(page.getByTestId("school-name")).toHaveText(MSASA.name);
  expect(await cssVar(page, "--primary")).toBe(MSASA.primary);
});

test("super admin resends a pending invite, and only the new link works", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `E2E Resend ${suffix}`;
  const adminEmail = `resend-${suffix}@e2e.spportal.test`;
  const password = "harare-e2e-2026";

  await signIn(page, PLATFORM_ADMIN);
  await expect(page).toHaveURL("/platform");
  await page.goto("/platform/schools/new");
  await page.getByLabel("School name").fill(name);
  await page.getByLabel("Stage").selectOption("secondary");
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/\/platform\/schools\/[0-9a-f-]{36}$/);
  const schoolId = page.url().split("/").pop()!;

  await page.getByLabel("Full name").fill("Rufaro Ncube");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Send invite" }).click();
  const admins = page.getByRole("list", { name: "School admins" });
  await expect(admins).toContainText("Invite sent, not accepted yet");
  const [firstToken] = await inviteTokensFor(adminEmail, 1);

  // Resend: a second email arrives with a new link.
  await admins.getByRole("button", { name: `Resend invite to ${adminEmail}` }).click();
  await expect(admins.getByRole("status")).toHaveText(`Invite sent again to ${adminEmail}.`);
  const [newToken] = await inviteTokensFor(adminEmail, 2);
  expect(newToken).not.toBe(firstToken);

  const inviteeContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: page.viewportSize(),
  });
  const invitee = await inviteeContext.newPage();

  // The first link no longer works; the new one does.
  await invitee.goto(`/auth/confirm?token_hash=${firstToken}&type=invite`);
  await expect(invitee).toHaveURL("/sign-in?invite=invalid");
  await invitee.goto(`/auth/confirm?token_hash=${newToken}&type=invite`);
  await expect(invitee).toHaveURL("/welcome");
  await invitee.getByLabel("New password").fill(password);
  await invitee.getByLabel("Confirm password").fill(password);
  await invitee.getByRole("button", { name: "Set password and continue" }).click();
  await expect(invitee).toHaveURL("/admin");
  await inviteeContext.close();

  // Once accepted there is nothing to resend.
  await page.reload();
  await expect(admins).toContainText("Active");
  await expect(admins.getByRole("button", { name: /Resend invite/ })).toHaveCount(0);

  // The resend is in the school's audit log, which its new admin can read.
  expect(await auditEventsAs(adminEmail, password, schoolId)).toEqual([
    "school_created",
    "admin_invited",
    "invite_resent",
  ]);
});
