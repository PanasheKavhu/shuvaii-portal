import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { learnerAuthEmail, pinPassword } from "../../src/lib/auth/learner-pin";
import { createEmptySchool, createMarksClass, mainNav, signIn, signedInClient } from "./helpers";
import { expectNoSideScroll, parentOf, serviceClient } from "./report-helpers";

// The newsletter (US-8.1 to US-8.4; D50) at 360 px (the mobile project) and
// on a desktop screen: the admin writes, previews and publishes to parents
// only; a parent sees it unread and the marker clears after opening; a
// learner and another school's teacher see nothing; once it expires the
// audience loses it while the admin list keeps it with its read count; a
// class post reaches only that class's families; attachments of the wrong
// type or over 5 MB are refused. Each test makes its own school, since
// announcements are never deleted.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

/** A page in a fresh browser context (its own sign in), sized like the test's own page. */
async function freshPage(browser: Browser, page: Page): Promise<Page> {
  const context = await browser.newContext({ viewport: page.viewportSize() });
  return context.newPage();
}

/** Gives a learner a login with a PIN, as the server does (D26), and signs them in. */
async function learnerPage(
  browser: Browser,
  page: Page,
  school: { schoolId: string; adminEmail: string },
  learner: { id: string; number: string },
): Promise<Page> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const pin = "481572";
  const id = randomUUID();
  const created = await serviceClient().auth.admin.createUser({
    id,
    email: learnerAuthEmail(learner.id),
    email_confirm: true,
    password: pinPassword(process.env.LEARNER_PIN_SECRET!, id, pin),
    app_metadata: { learner_id: learner.id, school_id: school.schoolId },
  });
  expect(created.error).toBeNull();
  const admin = await signedInClient(school.adminEmail);
  expect(
    (await admin.rpc("link_learner_login", { p_learner_id: learner.id, p_user_id: id })).error,
  ).toBeNull();
  const { data: schoolRow } = await serviceClient()
    .from("schools")
    .select("name")
    .eq("id", school.schoolId)
    .single();

  const p = await freshPage(browser, page);
  await p.goto("/sign-in/learner");
  await p.getByLabel("School").selectOption({ label: schoolRow!.name });
  await p.getByLabel("Learner number").fill(learner.number);
  await p.getByLabel("PIN", { exact: true }).fill(pin);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL("/my-reports");
  return p;
}

async function signedInPage(browser: Browser, page: Page, email: string, home: string) {
  const p = await freshPage(browser, page);
  await signIn(p, email);
  await expect(p).toHaveURL(home);
  return p;
}

async function learnerNumbers(schoolId: string) {
  const { data } = await serviceClient()
    .from("learners")
    .select("id, learner_number")
    .eq("school_id", schoolId)
    .order("learner_number");
  return data!.map((l) => ({ id: l.id, number: l.learner_number }));
}

/** Writes and saves a draft from the newsletter, returning its id. */
async function writeDraft(
  page: Page,
  values: { title: string; body: string; audience: string; className?: string },
): Promise<string> {
  await page.goto("/admin/newsletter");
  await page.getByRole("link", { name: "New announcement" }).click();
  await expect(page).toHaveURL("/admin/newsletter/new");
  await page.getByLabel("Title").fill(values.title);
  await page.getByLabel("Announcement", { exact: true }).fill(values.body);
  await page.getByRole("radio", { name: values.audience }).check();
  if (values.className)
    await page.getByLabel("Class", { exact: true }).selectOption({ label: values.className });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/newsletter\/[0-9a-f-]{36}\?done=saved$/);
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  return /newsletter\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published. Its audience can read it now.")).toBeVisible();
}

const newsItems = (page: Page) =>
  page.getByRole("list", { name: "Announcements" }).getByRole("link");

test("a parents-only post: unread for the parent until opened, unseen by others, gone when expired", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const school = await createMarksClass("news", { learners: 2 });
  const parentEmail = await parentOf(school.schoolId, [school.learners[0]!.id], "news");
  const other = await createEmptySchool("news-other");
  const title = `Parents evening ${Date.now()}`;

  // The admin writes, previews and publishes it.
  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await expect(mainNav(page).getByRole("link", { name: "Newsletter" })).toBeVisible();
  const id = await writeDraft(page, {
    title,
    body: "Dear parents,\n\nDetails at www.msasa.ac.zw/evening.\n<script>alert(1)</script>",
    audience: "Parents",
  });
  if (test.info().project.name === "mobile") await expectNoSideScroll(page);
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByRole("note")).toHaveText("Preview: this is how parents will see it.");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: "www.msasa.ac.zw/evening" })).toHaveAttribute(
    "href",
    "https://www.msasa.ac.zw/evening",
  );
  // Markup in the body is shown as typed, never run.
  await expect(page.getByText("<script>alert(1)</script>")).toBeVisible();
  await page.getByRole("link", { name: "Back to editing" }).click();
  await publish(page);
  await expect(page.getByTestId("read-count")).toHaveText("Read by 0 of 1");

  // The parent: the home names it, the menu counts it, the list marks it.
  const parent = await signedInPage(browser, page, parentEmail, "/children");
  await expect(parent.getByRole("region", { name: "New from the school" })).toContainText(title);
  await expect(mainNav(parent).getByRole("link", { name: /News/ })).toHaveText("News1 unread");
  await mainNav(parent).getByRole("link", { name: /News/ }).click();
  await expect(parent).toHaveURL("/news");
  await expect(newsItems(parent)).toHaveCount(1);
  await expect(newsItems(parent).first()).toHaveAttribute("data-unread", "true");
  await expect(newsItems(parent).first()).toContainText(`Unread: ${title}`);
  if (test.info().project.name === "mobile") await expectNoSideScroll(parent);
  await newsItems(parent).first().click();
  await expect(parent.getByRole("heading", { name: title })).toBeVisible();
  // Reading it drops the menu's count at once.
  await expect(mainNav(parent).getByRole("link", { name: /News/ })).toHaveText("News");
  await parent.getByRole("link", { name: "All news" }).click();
  await expect(newsItems(parent).first()).not.toHaveAttribute("data-unread", "true");
  await expect(parent.getByText("You are up to date.")).toBeVisible();
  await parent.goto("/children");
  await expect(parent.getByRole("region", { name: "New from the school" })).toHaveCount(0);

  // Dark mode keeps it readable and on screen.
  await parent.goto("/news");
  await parent.getByRole("radio", { name: "Dark" }).click();
  await expect(parent.locator("html")).toHaveClass(/\bdark\b/);
  await expect(newsItems(parent)).toHaveCount(1);
  if (test.info().project.name === "mobile") await expectNoSideScroll(parent);

  // A learner of the same school and a teacher of another school see nothing.
  const [first] = await learnerNumbers(school.schoolId);
  const learner = await learnerPage(browser, page, school, first!);
  await learner.goto("/news");
  await expect(learner.getByText("No news right now.")).toBeVisible();
  expect((await learner.goto(`/news/${id}`))?.status()).toBe(404);
  const outsider = await signedInPage(browser, page, other.teacherEmail, "/teaching");
  await outsider.goto("/news");
  await expect(outsider.getByText("No news right now.")).toBeVisible();
  expect((await outsider.goto(`/news/${id}`))?.status()).toBe(404);

  // Expired (as if a week had passed): the parent loses it, the admin keeps it.
  expect(
    (
      await serviceClient()
        .from("announcements")
        .update({
          published_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        })
        .eq("id", id)
    ).error,
  ).toBeNull();
  await parent.goto("/news");
  await expect(parent.getByText("No news right now.")).toBeVisible();
  expect((await parent.goto(`/news/${id}`))?.status()).toBe(404);
  await page.goto("/admin/newsletter");
  const row = page
    .getByRole("list", { name: "Published" })
    .getByRole("link", { name: new RegExp(title) });
  await expect(row).toContainText("Expired");
  await expect(row.getByTestId("read-count")).toHaveText("Read by 1 of 1");
});

test("a class post reaches only that class's parents and learners", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const school = await createMarksClass("newsclass", { learners: 1, secondClass: true });
  const [blue, green] = await learnerNumbers(school.schoolId).then((ls) => [
    ls.find((l) => l.number === "M001")!,
    ls.find((l) => l.number === "G001")!,
  ]);
  const blueParent = await parentOf(school.schoolId, [blue!.id], "newsclass");
  const greenParent = await parentOf(school.schoolId, [green!.id], "newsclass");
  const title = `4 Blue trip ${Date.now()}`;

  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await writeDraft(page, {
    title,
    body: "Bring lunch.",
    audience: "One class",
    className: "4 Blue",
  });
  await publish(page);
  await expect(page.getByText("For 4 Blue's learners, parents and teachers")).toBeVisible();

  for (const [email, sees] of [
    [blueParent, true],
    [greenParent, false],
  ] as const) {
    const p = await signedInPage(browser, page, email, "/children");
    await p.goto("/news");
    if (sees) await expect(newsItems(p)).toHaveText([new RegExp(title)]);
    else await expect(p.getByText("No news right now.")).toBeVisible();
  }
  for (const [learner, sees] of [
    [blue!, true],
    [green!, false],
  ] as const) {
    const p = await learnerPage(browser, page, school, learner);
    if (sees)
      await expect(p.getByRole("region", { name: "New from the school" })).toContainText(title);
    await p.goto("/news");
    if (sees) await expect(newsItems(p)).toHaveText([new RegExp(title)]);
    else await expect(p.getByText("No news right now.")).toBeVisible();
  }
});

test("an attachment of the wrong type or over 5 MB is refused; a PDF opens for the audience", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const school = await createMarksClass("newsfiles", { learners: 1 });
  const parentEmail = await parentOf(school.schoolId, [school.learners[0]!.id], "newsfiles");
  const title = `Fees notice ${Date.now()}`;

  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  const id = await writeDraft(page, {
    title,
    body: "See the attached notice.",
    audience: "Whole school",
  });
  const upload = page.getByRole("form", { name: "Attach a file" });
  await expect(upload).toContainText(
    "PDF, PNG, JPEG or WebP, up to 5 MB each, at most 3 files. 0 of 3 used.",
  );
  const file = upload.getByLabel("Attach a file");

  // Refused before uploading: the wrong type, and a file over 5 MB.
  await file.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(upload.getByRole("alert")).toHaveText("Attach a PDF or a PNG, JPEG or WebP image.");
  await expect(upload.getByRole("button", { name: "Upload file" })).toBeDisabled();
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024)]);
  await file.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: big });
  await expect(upload.getByRole("alert")).toHaveText("Each file must be 5 MB or smaller.");
  await expect(upload.getByRole("button", { name: "Upload file" })).toBeDisabled();

  // Refused by the server: called a PDF, but its bytes are not one.
  await file.setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><script>alert(1)</script></html>"),
  });
  await upload.getByRole("button", { name: "Upload file" }).click();
  await expect(upload.getByRole("alert")).toHaveText("Attach a PDF or a PNG, JPEG or WebP image.");

  // A real PDF is attached.
  await file.setInputFiles({
    name: "Fees notice.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"),
  });
  await upload.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByRole("list", { name: "Attached files" })).toContainText("Fees-notice.pdf");
  await expect(upload).toContainText("1 of 3 used.");
  await publish(page);

  // The parent opens it through a short signed link.
  const parent = await signedInPage(browser, page, parentEmail, "/children");
  await parent.goto(`/news/${id}`);
  const link = parent.getByRole("link", { name: /Fees-notice\.pdf/ });
  await expect(link).toBeVisible();
  const response = await parent.request.get((await link.getAttribute("href"))!, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("token=");
  const file2 = await parent.request.get(response.headers().location!);
  expect(file2.headers()["content-type"]).toContain("application/pdf");
});
