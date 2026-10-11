import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { learnerAuthEmail, pinPassword } from "../../src/lib/auth/learner-pin";
import { flatText, readPdf } from "../unit/reports/pdf-text";
import { signIn, signedInClient } from "./helpers";
import {
  approvedClass,
  expectNoSideScroll,
  parentOf,
  publishWithPdfs,
  serviceClient,
  someAddress,
} from "./report-helpers";

// The learner and parent portal (US-7.1 to US-7.5; D47) at 360 px (the
// mobile project) and on a desktop screen: a parent with two children
// switches between them and downloads a PDF, a learner signs in with their
// PIN and opens their own report, a share link opens signed out and stops
// after revoking, and a report that is not published (approved, or a
// reissued draft) is never shown to either. Each test makes its own school,
// since reports are never deleted.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

/** Gives a learner a login with `pin`, as the server does (D26), linked by the school admin. */
async function learnerLogin(school: { schoolId: string; adminEmail: string }, learnerId: string) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const pin = "481572";
  const id = randomUUID();
  const created = await serviceClient().auth.admin.createUser({
    id,
    email: learnerAuthEmail(learnerId),
    email_confirm: true,
    password: pinPassword(process.env.LEARNER_PIN_SECRET!, id, pin),
    app_metadata: { learner_id: learnerId, school_id: school.schoolId },
  });
  expect(created.error).toBeNull();
  const admin = await signedInClient(school.adminEmail);
  expect(
    (await admin.rpc("link_learner_login", { p_learner_id: learnerId, p_user_id: id })).error,
  ).toBeNull();
  return pin;
}

async function learnerSignIn(page: Page, schoolName: string, number: string, pin: string) {
  await page.goto("/sign-in/learner");
  await page.getByLabel("School").selectOption({ label: schoolName });
  await page.getByLabel("Learner number").fill(number);
  await page.getByLabel("PIN", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function reportIds(enrolmentIds: string[]) {
  const { data } = await serviceClient()
    .from("reports")
    .select("id, enrolment_id, version, status")
    .in("enrolment_id", enrolmentIds)
    .order("version");
  return data!;
}

test("a parent switches children and downloads, a learner opens their own, drafts never show", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const school = await approvedClass("portal");
  const [chipo, farai, tatenda] = school.learners as [
    (typeof school.learners)[0],
    (typeof school.learners)[0],
    (typeof school.learners)[0],
  ];
  const parentEmail = await parentOf(school.schoolId, [chipo.id, farai.id], "portal");
  const pin = await learnerLogin(school, chipo.id);
  const mobile = page.viewportSize()!.width === 360;
  const newPage = async () => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": someAddress() },
    });
    const p = await context.newPage();
    if (mobile) await p.setViewportSize({ width: 360, height: 780 });
    return p;
  };
  const approved = await reportIds([chipo.enrolmentId, farai.enrolmentId]);
  expect(approved.map((r) => r.status)).toEqual(["approved", "approved"]);

  // Approved but not published: neither the parent nor the learner sees it.
  const parent = await newPage();
  await signIn(parent, parentEmail);
  await expect(parent).toHaveURL("/children");
  const children = parent.getByRole("list", { name: "Your children" });
  await expect(children.getByRole("link")).toHaveText([chipo.name, farai.name]);
  await expect(
    parent.getByText(`No published reports for ${chipo.name.split(" ")[0]} yet.`),
  ).toBeVisible();
  await expectNoSideScroll(parent);
  for (const r of approved) {
    const response = await parent.goto(`/children/reports/${r.id}`);
    expect(response!.status()).toBe(404);
  }

  const learner = await newPage();
  await learnerSignIn(learner, school.schoolName, "M001", pin);
  await expect(learner).toHaveURL("/my-reports");
  await expect(learner.getByText("No published reports yet.")).toBeVisible();
  expect((await learner.goto(`/my-reports/${approved[0]!.id}`))!.status()).toBe(404);

  // The head publishes; the PDFs are made once.
  await publishWithPdfs(page, school, 3);
  const [chipoReport, faraiReport] = [chipo, farai].map((l) =>
    approved.find((r) => r.enrolment_id === l.enrolmentId)!,
  );

  // The parent sees Chipo's report by year and term, opens it on screen.
  await parent.goto("/children");
  await expect(parent.getByRole("heading", { name: `Reports for ${chipo.name}` })).toBeVisible();
  const thisYear = parent.getByRole("list", { name: "Reports for This year" });
  await expect(thisYear.getByRole("link")).toHaveCount(1);
  await thisYear.getByRole("link", { name: /Term Now/ }).click();
  await expect(parent).toHaveURL(`/children/reports/${chipoReport!.id}`);
  const report = parent.getByRole("article", { name: "Report" });
  await expect(report.getByLabel("Learner")).toContainText(chipo.name);
  const maths = report
    .getByRole("table", { name: "Subjects" })
    .getByRole("row", { name: /Mathematics/ });
  await expect(maths).toBeVisible();
  await expect(report).toContainText("Steady work in algebra.");
  await expect(report).toContainText("A good term.");
  await expect(report.getByLabel("Results")).toContainText("Position");
  await expect(report).toContainText("Grading key");
  await expectNoSideScroll(parent);

  // Download PDF serves the stored file under the report's reference.
  const [download] = await Promise.all([
    parent.waitForEvent("download"),
    parent.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^report-[A-Z0-9]{10}\.pdf$/);
  const { readFile } = await import("node:fs/promises");
  const pdfText = flatText(readPdf(await readFile((await download.path())!)));
  expect(pdfText).toContain(chipo.name);
  expect(pdfText).toContain("Steady work in algebra.");

  // One tap switches to Farai; Tatenda (another family) is never listed.
  await parent.goto("/children");
  await children.getByRole("link", { name: farai.name }).click();
  await expect(parent.getByRole("heading", { name: `Reports for ${farai.name}` })).toBeVisible();
  await expect(children.getByRole("link", { name: farai.name })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await thisYear.getByRole("link", { name: /Term Now/ }).click();
  await expect(parent).toHaveURL(`/children/reports/${faraiReport!.id}`);
  await expect(parent.getByRole("article", { name: "Report" }).getByLabel("Learner")).toContainText(
    farai.name,
  );
  await expect(parent.getByText(tatenda.name)).toHaveCount(0);
  const [tatendaReport] = await reportIds([tatenda.enrolmentId]);
  expect((await parent.goto(`/children/reports/${tatendaReport!.id}`))!.status()).toBe(404);

  // The learner sees only their own report, not their sibling's.
  await learner.goto("/my-reports");
  await learner.getByRole("link", { name: /Term Now/ }).click();
  await expect(learner).toHaveURL(`/my-reports/${chipoReport!.id}`);
  await expect(
    learner.getByRole("article", { name: "Report" }).getByLabel("Learner"),
  ).toContainText(chipo.name);
  await expectNoSideScroll(learner);
  expect((await learner.goto(`/my-reports/${faraiReport!.id}`))!.status()).toBe(404);

  // A reissued draft is never shown: the head withdraws Chipo's report.
  const head = await signedInClient(school.headEmail!);
  const reissue = await head.rpc("withdraw_report", {
    p_report_id: chipoReport!.id,
    p_reason: "Wrong mark in Mathematics.",
  });
  expect(reissue.error).toBeNull();
  await parent.goto(`/children?child=${chipo.id}`);
  await expect(
    parent.getByText(`No published reports for ${chipo.name.split(" ")[0]} yet.`),
  ).toBeVisible();
  expect((await parent.goto(`/children/reports/${reissue.data}`))!.status()).toBe(404);
  expect((await parent.goto(`/children/reports/${chipoReport!.id}`))!.status()).toBe(404);
  await learner.goto("/my-reports");
  await expect(learner.getByText("No published reports yet.")).toBeVisible();
  expect((await learner.goto(`/my-reports/${reissue.data}`))!.status()).toBe(404);
});

test("a share link opens the PDF signed out for 7 days and stops once revoked", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const school = await approvedClass("share");
  const learner = school.learners[0]!;
  const parentEmail = await parentOf(school.schoolId, [learner.id], "share");
  await publishWithPdfs(page, school, 3);
  const [report] = await reportIds([learner.enrolmentId]);

  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const parent = await context.newPage();
  if (page.viewportSize()!.width === 360) await parent.setViewportSize({ width: 360, height: 780 });
  await signIn(parent, parentEmail);
  await expect(parent).toHaveURL("/children");
  await parent.goto(`/children/reports/${report!.id}`);

  // Share: the link, a WhatsApp button that fills it in, and Copy.
  await parent.getByRole("button", { name: "Share" }).click();
  const field = parent.getByLabel("Share link");
  await expect(field).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  const whatsApp = parent.getByRole("link", { name: "WhatsApp" });
  const href = (await whatsApp.getAttribute("href"))!;
  expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
    `Term Now This year school report from ${school.schoolName}: ${link}`,
  );
  await parent.getByRole("button", { name: "Copy link" }).click();
  await expect(parent.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await parent.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expectNoSideScroll(parent);

  // Only the hash is stored, and the link lasts 7 days.
  const { data: shares } = await serviceClient()
    .from("report_shares")
    .select("token_hash, expires_at, revoked_at")
    .eq("report_id", report!.id);
  expect(shares).toHaveLength(1);
  const token = link.split("/s/")[1]!;
  const { createHash } = await import("node:crypto");
  expect(shares![0]!.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
  const days = (Date.parse(shares![0]!.expires_at) - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.99);
  expect(days).toBeLessThanOrEqual(7);

  // Signed out, from another network: the link opens the stored PDF.
  const stranger = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const opened = await stranger.request.get(link);
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  expect(flatText(readPdf(await opened.body()))).toContain(learner.name);

  // The owner sees the link and how often it opened, and revokes it.
  await parent.reload();
  const active = parent.getByRole("list", { name: "Your active links" });
  await expect(active.getByRole("listitem")).toHaveCount(1);
  await expect(active).toContainText("opened 1 time");
  await active.getByRole("button", { name: "Revoke" }).click();
  await expect(parent.getByRole("list", { name: "Your active links" })).toHaveCount(0);

  // Now the link fails, signed out.
  const visitor = await stranger.newPage();
  if (page.viewportSize()!.width === 360)
    await visitor.setViewportSize({ width: 360, height: 780 });
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
  await expectNoSideScroll(visitor);
  const gone = await stranger.request.get(link, { maxRedirects: 0 });
  expect(gone.headers()["content-type"]).toContain("text/html");
  await stranger.close();
  await context.close();
});

test("share link opens are limited per network address", async ({ request }) => {
  const headers = { "x-forwarded-for": someAddress() };
  const unknown = `/s/${"A".repeat(43)}`;
  for (let i = 0; i < 20; i++) {
    const r = await request.get(unknown, { headers });
    expect(await r.text()).toContain("This link no longer works");
  }
  const blocked = await request.get(unknown, { headers });
  expect(await blocked.text()).toContain("Too many reports opened");
  const other = await request.get(unknown, { headers: { "x-forwarded-for": someAddress() } });
  expect(await other.text()).toContain("This link no longer works");
});
