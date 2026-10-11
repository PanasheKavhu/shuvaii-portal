import { expect, test } from "@playwright/test";
import { flatText, readPdf } from "../unit/reports/pdf-text";
import { PASSWORD, signIn, signedInClient } from "./helpers";
import {
  approvedClass,
  expectNoSideScroll,
  parentOf,
  serviceClient,
  someAddress,
} from "./report-helpers";

// Withdrawing and reissuing a report (US-6.6; D46) at 360 px (the mobile
// project) and on a desktop screen: the head withdraws a published report
// with a reason, the old verification code then says withdrawn, the next
// version goes through submit, approve and publish and its PDF says
// "Amended · version 2", a parent sees only the new version, and the school
// still opens the old PDF from the audit screen. Each run makes its own
// school, since reports are never deleted.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

test("the head withdraws a report with a reason and the reissued version replaces it", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const school = await approvedClass("withdraw");
  const learner = school.learners[0]!;
  const parentEmail = await parentOf(school.schoolId, [learner.id], "withdraw");
  const service = serviceClient();
  const versions = async () =>
    (
      await service
        .from("reports")
        .select("id, version, status, verification_code, withdrawn_reason, pdf_path")
        .eq("enrolment_id", learner.enrolmentId)
        .order("version")
    ).data!;

  // Publish the class and let its PDFs be made.
  await signIn(page, school.headEmail!);
  await expect(page).toHaveURL("/head");
  const classPage = `/head/reports/${school.classId}/${school.termId}`;
  await page.goto(classPage);
  await page.getByRole("button", { name: "Publish 3 reports" }).click();
  const pdfs = page.getByRole("region", { name: "Report PDFs" });
  await expect(pdfs.getByRole("status")).toHaveText("3 of 3 report PDFs ready.", {
    timeout: 60_000,
  });
  const [v1] = await versions();
  expect(v1!.pdf_path).not.toBeNull();

  // Withdraw it: a reason is needed.
  const card = page.getByRole("article", { name: learner.name });
  await card.locator("summary", { hasText: "Withdraw" }).click();
  const form = card.getByRole("form", { name: `Withdraw ${learner.name}'s report` });
  await form.getByRole("button", { name: "Withdraw and reissue" }).click();
  await expect(form).toContainText("Say why the report is withdrawn.");
  await form.getByLabel("Reason for withdrawing").fill("Wrong mark in Mathematics.");
  await expectNoSideScroll(page);
  await form.getByRole("button", { name: "Withdraw and reissue" }).click();

  // The card now holds version 2, a draft with the class teacher.
  await expect(card).toContainText("With the class teacher");
  await expect(card).toContainText("Version 2");
  await expect(page.getByLabel("Where the reports stand")).toHaveText(
    "2 published, 1 with the class teacher",
  );
  const afterWithdraw = await versions();
  expect(afterWithdraw.map((r) => [r.version, r.status])).toEqual([
    [1, "withdrawn"],
    [2, "draft"],
  ]);
  expect(afterWithdraw[0]!.withdrawn_reason).toBe("Wrong mark in Mathematics.");

  // The old verification code now says withdrawn, with no sign in.
  const stranger = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const visitor = await stranger.newPage();
  if (page.viewportSize()!.width === 360)
    await visitor.setViewportSize({ width: 360, height: 780 });
  await visitor.goto(`/verify/${v1!.verification_code}`);
  await expect(visitor.getByRole("heading", { name: "Report withdrawn" })).toBeVisible();
  await expect(visitor.getByLabel("Report details").locator("dd").last()).toHaveText(
    "Withdrawn by the school: no longer valid",
  );
  await expectNoSideScroll(visitor);

  // Version 2 goes through the workflow again: submitted, approved, published.
  const teacher = await signedInClient(school.teacherEmail);
  expect(
    (
      await teacher.rpc("submit_class_reports", {
        p_class_id: school.classId,
        p_term_id: school.termId,
      })
    ).data,
  ).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Approve 1 report" }).click();
  await page.getByRole("button", { name: "Publish 1 report" }).click();
  await expect(pdfs.getByRole("status")).toHaveText("3 of 3 report PDFs ready.", {
    timeout: 60_000,
  });
  const [, v2] = await versions();
  expect(v2!.status).toBe("published");
  expect(v2!.verification_code).not.toBe(v1!.verification_code);

  // The reissued PDF says Amended with its version.
  const open = card.getByRole("link", { name: `Open PDF of ${learner.name}'s report` });
  const pdf = await page.request.get((await open.getAttribute("href"))!);
  expect(pdf.status()).toBe(200);
  const text = flatText(readPdf(await pdf.body()));
  expect(text).toContain("Amended · version 2");
  expect(text).toContain(learner.name);

  // The new code checks out as amended; the old one is still withdrawn.
  await visitor.goto(`/verify/${v2!.verification_code}`);
  await expect(visitor.getByRole("heading", { name: "Report verified" })).toBeVisible();
  await expect(visitor.getByLabel("Report details").locator("dd").last()).toHaveText(
    "Valid: published by the school (amended, version 2)",
  );
  await stranger.close();

  // A parent sees only the new version, through the API and the PDF links.
  const parent = await signedInClient(parentEmail);
  const { data: seen } = await parent.from("reports").select("id, version, status");
  expect(seen).toEqual([{ id: v2!.id, version: 2, status: "published" }]);
  const family = await browser.newContext();
  const parentPage = await family.newPage();
  await signIn(parentPage, parentEmail, PASSWORD);
  await expect(parentPage).toHaveURL("/children");
  expect(
    (await parentPage.request.get(`/reports/${v1!.id}/pdf`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  expect((await parentPage.request.get(`/reports/${v2!.id}/pdf`)).status()).toBe(200);
  await family.close();

  // The school still opens the old version's PDF from the audit screen.
  await page.goto(`/admin/audit?learner=${learner.id}`);
  const changes = page.getByRole("list", { name: "Changes" });
  await expect(changes).toContainText(`withdrew ${learner.name}'s report`);
  await expect(changes).toContainText("Reason: Wrong mark in Mathematics.");
  const old = changes.getByRole("link", { name: "Open PDF (version 1)" }).first();
  await expect(old).toBeVisible();
  const oldPdf = await page.request.get((await old.getAttribute("href"))!);
  expect(oldPdf.status()).toBe(200);
  expect(flatText(readPdf(await oldPdf.body()))).not.toContain("Amended");
  await expectNoSideScroll(page);
});
