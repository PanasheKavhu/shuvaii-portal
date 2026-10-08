import { expect, test, type Page } from "@playwright/test";
import {
  MSASA_ADMIN,
  PASSWORD,
  createEmptySchool,
  createFamily,
  resetEmailFor,
  signIn,
} from "./helpers";

// Phase 2 review (D27): being added to a school never gives access without
// the person's say, and an address nobody proved never becomes a staff
// account. Phone-sized screen.
test.use({ viewport: { width: 360, height: 780 } });
test.describe.configure({ timeout: 120_000 });

async function addStaff(page: Page, fullName: string, email: string) {
  await page.goto("/admin/people/staff/new");
  const form = page.getByRole("form", { name: "Add a staff member" });
  await form.getByLabel("Full name").fill(fullName);
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Add and invite" }).click();
}

test("an address a parent claimed without proof cannot be added as staff until it is proved", async ({
  browser,
  page,
}) => {
  const family = await createFamily("tko");
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/people/learners/${family.learners[0].id}`);
  const form = page.getByRole("form", { name: `Parent code for ${family.guardianName}` });
  await form.getByRole("button", { name: "Make a parent code" }).click();
  const code = (await form.getByRole("status").locator(".font-mono").textContent())!.trim();

  // Someone with a parent code registers a future teacher's address.
  const teacherEmail = `future-teacher-${family.lastName.toLowerCase()}@demo.spportal.test`;
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`/join?code=${code}`);
  await other.getByLabel("Email").fill(teacherEmail);
  await other.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await other.getByLabel("Confirm password").fill(PASSWORD);
  await other.getByRole("button", { name: "Create account" }).click();
  await expect(other).toHaveURL("/children");

  // The school later adds the real teacher: refused, nothing is added.
  await addStaff(page, "Future Teacher", teacherEmail);
  await expect(page.getByRole("form", { name: "Add a staff member" })).toContainText(
    "belongs to an account whose email address was never confirmed",
  );
  await expect(page).toHaveURL("/admin/people/staff/new");

  // The real owner resets the password from the inbox, which proves it and
  // signs the other person out; then the school can add them.
  const owner = await (await browser.newContext()).newPage();
  await owner.goto("/forgot-password");
  await owner.getByLabel("Email").fill(teacherEmail);
  await owner.getByRole("button", { name: "Send reset email" }).click();
  const { tokenHash } = await resetEmailFor(teacherEmail);
  await owner.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
  await owner.getByLabel("New password").fill("owner-new-pass-2026");
  await owner.getByLabel("Confirm password").fill("owner-new-pass-2026");
  await owner.getByRole("button", { name: "Save new password" }).click();
  await expect(owner).toHaveURL("/children");

  await addStaff(page, "Future Teacher", teacherEmail);
  await expect(page.getByRole("status")).toHaveText(
    "Added. They already have an account, so they will be asked to accept when they next sign in.",
  );
  await otherContext.close();
});

test("a teacher added by another school accepts before getting access, and that school cannot edit them", async ({
  browser,
  page,
}) => {
  const home = await createEmptySchool("consa");
  const other = await createEmptySchool("consb");
  await signIn(page, other.adminEmail);
  await expect(page).toHaveURL("/admin");

  await addStaff(page, home.teacherName, home.teacherEmail);
  await expect(page.getByRole("status")).toHaveText(
    "Added. They already have an account, so they will be asked to accept when they next sign in.",
  );
  const roles = page.getByRole("list", { name: "Roles" });
  await expect(roles).toContainText("Invited");

  // The new school cannot rename someone who also belongs to Msasa.
  const details = page.getByRole("form", { name: "Staff details" });
  await details.getByLabel("Full name").fill("Renamed By Another School");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details).toContainText("They also belong to another school");

  // The teacher is asked on next sign in, and accepts.
  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, home.teacherEmail);
  await expect(teacher).toHaveURL("/welcome");
  const waiting = teacher.getByRole("list", { name: "Waiting for you" });
  await expect(waiting).toContainText("Teacher");
  await expect(teacher.getByLabel("New password")).toHaveCount(0);
  await teacher.getByRole("button", { name: "Accept" }).click();
  await expect(teacher).toHaveURL("/select-school");

  await page.reload();
  await expect(roles).toContainText("Active");
  await expect(roles).not.toContainText("Invited");
});
