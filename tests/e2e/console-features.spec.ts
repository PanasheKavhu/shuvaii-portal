import path from "node:path";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  PASSWORD,
  PLATFORM_ADMIN,
  auditEventsAs,
  createEmptySchool,
  createMarksClass,
  mainNav,
  signIn,
  signedInClient,
} from "./helpers";
import { expectNoSideScroll, parentOf } from "./report-helpers";

// The console's feature switches (US-10.3; D55), usage (US-10.4) and
// onboarding checklist (D56), at 360 px (the mobile project) and on a
// desktop screen. Each test makes its own schools, so switching one off
// never touches the seed schools other tests use.

const LOGO = path.join(__dirname, "fixtures", "logo.png");

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

async function signedInPage(browser: Browser, page: Page, email: string, home: string) {
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const p = await context.newPage();
  await signIn(p, email);
  await expect(p).toHaveURL(home);
  return p;
}

/** A school with one learner, a parent of that learner, and one published announcement for everyone. */
async function schoolWithNews(prefix: string) {
  const school = await createMarksClass(prefix, { learners: 1 });
  const parentEmail = await parentOf(school.schoolId, [school.learners[0]!.id], prefix);
  const title = `${prefix} sports day ${Date.now()}`;
  const admin = await signedInClient(school.adminEmail);
  const { data: id, error } = await admin.rpc("save_announcement", {
    p_school_id: school.schoolId,
    p_title: title,
    p_body: "Sports day is on Friday.",
    p_audience: "all",
    p_pinned: false,
  });
  expect(error).toBeNull();
  expect((await admin.rpc("publish_announcement", { p_announcement_id: id! })).error).toBeNull();
  return { ...school, parentEmail, title, announcementId: id! };
}

async function expectNotAllowed(p: Page, target: string) {
  const res = await p.goto(target);
  expect(res?.status(), target).toBe(403);
  await expect(p.getByRole("heading", { name: "Not allowed" })).toBeVisible();
}

test("switching the newsletter off closes it for one school's users only, and back on restores it", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const [a, b] = await Promise.all([schoolWithNews("flags-a"), schoolWithNews("flags-b")]);

  // The super admin switches school A's newsletter off.
  await signIn(page, PLATFORM_ADMIN);
  await page.goto(`/platform/schools/${a.schoolId}`);
  const features = page.getByRole("list", { name: "Features" });
  await expect(features).toContainText("NewsletterOn");
  await features.getByRole("button", { name: "Switch newsletter off" }).click();
  await expect(features.getByRole("status")).toHaveText("Newsletter switched off.");
  await expect(features).toContainText("NewsletterOff");
  await expect(features.getByRole("button", { name: "Switch newsletter on" })).toBeVisible();
  await expectNoSideScroll(page);

  // School A's parent: no News in the menu or on the home page, and the pages refuse.
  const parentA = await signedInPage(browser, page, a.parentEmail, "/children");
  await expect(mainNav(parentA).getByRole("link", { name: /^News/ })).toHaveCount(0);
  await expect(parentA.getByRole("region", { name: "New from the school" })).toHaveCount(0);
  await expectNotAllowed(parentA, "/news");
  await expectNotAllowed(parentA, `/news/${a.announcementId}`);

  // School A's admin: no Newsletter in the menu or the overview, and the pages refuse.
  const adminA = await signedInPage(browser, page, a.adminEmail, "/admin");
  await expect(mainNav(adminA).getByRole("link", { name: "Newsletter" })).toHaveCount(0);
  await expect(adminA.getByRole("link", { name: /^Newsletter/ })).toHaveCount(0);
  await expect(adminA.getByRole("link", { name: /^People/ })).toBeVisible();
  await expectNotAllowed(adminA, "/admin/newsletter");
  await expectNotAllowed(adminA, "/admin/newsletter/new");
  await expectNotAllowed(adminA, `/admin/newsletter/${a.announcementId}`);

  // The database refuses too, whatever the screens do.
  const apiParentA = await signedInClient(a.parentEmail);
  expect((await apiParentA.rpc("my_news", { p_school_id: a.schoolId })).data).toEqual([]);
  const apiAdminA = await signedInClient(a.adminEmail);
  expect((await apiAdminA.rpc("my_announcements", { p_school_id: a.schoolId })).data).toEqual([]);
  const refused = await apiAdminA.rpc("save_announcement", {
    p_school_id: a.schoolId,
    p_title: "Sneaked in",
    p_body: "Through the API.",
    p_audience: "all",
    p_pinned: false,
  });
  expect(refused.error?.code).toBe("42501");

  // School B is unaffected.
  const parentB = await signedInPage(browser, page, b.parentEmail, "/children");
  await expect(mainNav(parentB).getByRole("link", { name: /^News/ })).toBeVisible();
  await parentB.goto("/news");
  await expect(parentB.getByRole("link", { name: new RegExp(b.title) })).toBeVisible();

  // Back on: school A's parent has the News and the same announcement again.
  await page.reload();
  await features.getByRole("button", { name: "Switch newsletter on" }).click();
  await expect(features.getByRole("status")).toHaveText("Newsletter switched on.");
  await expect(features).toContainText("NewsletterOn");
  await parentA.goto("/children");
  await expect(mainNav(parentA).getByRole("link", { name: /^News/ })).toBeVisible();
  await expect(parentA.getByRole("region", { name: "New from the school" })).toContainText(a.title);
  await parentA.goto("/news");
  await expect(parentA.getByRole("link", { name: new RegExp(a.title) })).toBeVisible();
  await adminA.goto("/admin/newsletter");
  await expect(adminA.getByRole("heading", { level: 1 })).toBeVisible();

  // Each switch is a console event in school A's audit log, and none in B's.
  const eventsA = await auditEventsAs(a.adminEmail, PASSWORD, a.schoolId);
  expect(eventsA.filter((e) => e === "feature_changed")).toHaveLength(2);
  const eventsB = await auditEventsAs(b.adminEmail, PASSWORD, b.schoolId);
  expect(eventsB).not.toContain("feature_changed");
  await adminA.goto("/admin/audit");
  await expect(adminA.getByText(/switched the newsletter off/).first()).toBeVisible();

  for (const p of [parentA, adminA, parentB]) await p.context().close();
});

test("the onboarding checklist turns green as a new school is set up", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const school = await createEmptySchool("onboard");
  const status = page.getByRole("status", { name: "Onboarding status" });
  const checklist = page.getByRole("list", { name: "Onboarding checklist" });
  const item = (label: string) => checklist.getByRole("listitem").filter({ hasText: label });
  const expectDone = async (labels: string[], done: boolean) => {
    for (const label of labels)
      await expect(item(label), label).toHaveAttribute("data-done", String(done));
  };

  await signIn(page, PLATFORM_ADMIN);
  await page.goto(`/platform/schools/${school.schoolId}`);
  await expect(status).toHaveText("0 of 8 done.");
  await expect(checklist.getByRole("listitem")).toHaveCount(8);
  await expectNoSideScroll(page);

  // Usage: numbers only, for the new school.
  const usage = page.getByRole("region", { name: "Usage" });
  await expect(usage).toContainText("Staff3");
  await expect(usage).toContainText("Learners0");
  await expect(usage).toContainText("Last marks entryNever");

  // The super admin's part: colours, logo and the privacy contact.
  await page.getByLabel("Primary colour", { exact: true }).fill("#7a1fa2");
  await page.getByLabel("Accent colour", { exact: true }).fill("#ffb703");
  await page.getByRole("button", { name: "Save colours" }).click();
  await expect(page.getByRole("region", { name: "Colours" }).getByRole("status")).toHaveText(
    "Colours saved.",
  );
  await page.getByLabel("Logo image").setInputFiles(LOGO);
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByRole("region", { name: "Logo" }).getByRole("status")).toHaveText(
    "Logo uploaded.",
  );
  const privacy = page.getByRole("region", { name: "Privacy notice contact" });
  await privacy.getByLabel("Contact name").fill("The Bursar");
  await privacy.getByLabel("Contact email").fill("not-an-email");
  await privacy.getByRole("button", { name: "Save privacy contact" }).click();
  await expect(privacy.getByText("Enter a valid email address.")).toBeVisible();
  await privacy.getByLabel("Contact email").fill("privacy@onboard.test");
  await privacy.getByRole("button", { name: "Save privacy contact" }).click();
  await expect(privacy.getByRole("status")).toHaveText("Privacy contact saved.");
  await page.reload();
  await expectDone(["Logo and colours set", "Privacy notice contact filled in"], true);
  await expect(status).toHaveText("2 of 8 done.");

  // The school admin signs in for the first time and sets up two-factor.
  const admin = await signedInPage(browser, page, school.adminEmail, "/admin");
  await page.reload();
  await expectDone(["First school admin accepted, with two-factor set up"], true);

  // The school admin's setup: grading key, a current year with a term, a
  // class (first without a class teacher), then report settings.
  const db = await signedInClient(school.adminEmail);
  const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    expect(r.error).toBeNull();
    return r.data!;
  };
  const scale = must(
    await db
      .from("grading_scales")
      .insert({ school_id: school.schoolId, name: "Our key", stage: "o_level" })
      .select("id")
      .single(),
  );
  must(
    await db
      .from("grading_bands")
      .insert({
        school_id: school.schoolId,
        scale_id: scale.id,
        grade: "P",
        min_mark: 50,
        max_mark: 100,
      })
      .select("id"),
  );
  const level = must(
    await db
      .from("grade_levels")
      .insert({
        school_id: school.schoolId,
        name: "Form 1",
        stage: "o_level",
        grading_scale_id: scale.id,
      })
      .select("id")
      .single(),
  );
  const year = must(
    await db
      .from("academic_years")
      .insert({
        school_id: school.schoolId,
        label: "2026",
        starts_on: "2026-01-13",
        ends_on: "2026-12-04",
        is_current: true,
      })
      .select("id")
      .single(),
  );
  const klass = must(
    await db
      .from("classes")
      .insert({
        school_id: school.schoolId,
        academic_year_id: year.id,
        grade_level_id: level.id,
        name: "1 Blue",
      })
      .select("id")
      .single(),
  );
  await page.reload();
  await expect(item("Grading scale complete for every grade level")).toContainText(
    "1 grade level still needs a complete scale.",
  );
  await expect(item("A class teacher for every class")).toContainText(
    "1 class without a class teacher.",
  );
  await expectDone(["Term dates set for the current year"], false);

  must(
    await db
      .from("grading_bands")
      .insert({
        school_id: school.schoolId,
        scale_id: scale.id,
        grade: "F",
        min_mark: 0,
        max_mark: 49,
      })
      .select("id"),
  );
  must(
    await db
      .from("terms")
      .insert({
        school_id: school.schoolId,
        academic_year_id: year.id,
        name: "Term 1",
        kind: "term",
        starts_on: "2026-01-13",
        ends_on: "2026-04-09",
      })
      .select("id"),
  );
  const staff = must(await db.rpc("school_staff", { p_school_id: school.schoolId }));
  const teacherId = staff.find((m) => m.full_name === school.teacherName)!.user_id;
  must(
    await db
      .from("classes")
      .update({ class_teacher_id: teacherId })
      .eq("id", klass.id)
      .select("id"),
  );
  await page.reload();
  await expectDone(
    [
      "Grading scale complete for every grade level",
      "Term dates set for the current year",
      "A class teacher for every class",
    ],
    true,
  );
  await expect(status).toHaveText("6 of 8 done.");

  // Report settings, on the admin's own screen: stamp, signature and the
  // term report reviewed and saved.
  await admin.goto("/admin/setup/reports");
  const image = readFileSync(LOGO);
  const stamp = admin.getByRole("form", { name: "School stamp image" });
  await stamp.getByLabel("School stamp image").setInputFiles({
    name: "stamp.png",
    mimeType: "image/png",
    buffer: image,
  });
  await stamp.getByRole("button", { name: "Upload school stamp" }).click();
  await expect(stamp.getByText("School stamp uploaded.")).toBeVisible();
  const signature = admin.getByRole("form", { name: "Head's signature image" });
  await signature.getByLabel("Head's signature image").setInputFiles({
    name: "signature.png",
    mimeType: "image/png",
    buffer: image,
  });
  await signature.getByRole("button", { name: "Upload head's signature" }).click();
  await expect(signature.getByText("Head's signature uploaded.")).toBeVisible();
  await page.reload();
  await expectDone(["Stamp and head's signature uploaded"], true);
  await expectDone(["Report template reviewed"], false);

  const term = admin.getByRole("form", { name: "Term report" });
  await term.getByRole("button", { name: "Save term report" }).click();
  await expect(term.getByText("Term report settings saved.")).toBeVisible();

  await page.reload();
  await expect(status).toHaveText("Onboarding complete: the school is ready.");
  await expect(checklist.locator('[data-done="false"]')).toHaveCount(0);
  await expectNoSideScroll(page);

  // The overview lists the school with its numbers, and no names.
  await page.goto("/platform");
  const overview = page.getByRole("list", { name: "Schools overview" });
  const card = overview.getByRole("link").filter({ hasText: school.schoolName });
  await expect(card).toContainText("0 learners · 3 staff · 0 parents · 0 reports");
  await expect(card).toContainText("Last activity: Today");
  await expect(overview).not.toContainText(school.adminName);
  await expectNoSideScroll(page);

  await admin.context().close();
});
