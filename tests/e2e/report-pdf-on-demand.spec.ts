import { expect, test } from "@playwright/test";
import { signIn, signedInClient } from "./helpers";
import { approvedClass, parentOf, serviceClient, someAddress } from "./report-helpers";

// D48: a published report whose PDF was never made (the head closed the
// page before the class finished) gets it made when its family first opens
// it, by the page or the PDF route, and only after their own read has found
// it: another family's request makes nothing.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

test("a PDF left unmade after publishing is made when the family opens it", async ({ browser }) => {
  test.setTimeout(240_000);
  const school = await approvedClass("on-demand");
  const [chipo, tendai, tatenda] = school.learners as [
    (typeof school.learners)[0],
    (typeof school.learners)[0],
    (typeof school.learners)[0],
  ];
  const parentEmail = await parentOf(school.schoolId, [chipo.id, tendai.id], "on-demand");
  // Published, but the head never opened the page that makes the PDFs.
  const head = await signedInClient(school.headEmail!);
  expect(
    (
      await head.rpc("publish_class_reports", {
        p_class_id: school.classId,
        p_term_id: school.termId,
      })
    ).error,
  ).toBeNull();
  const service = serviceClient();
  const pathOf = async (enrolmentId: string) =>
    (
      await service
        .from("reports")
        .select("id, pdf_path")
        .eq("enrolment_id", enrolmentId)
        .eq("status", "published")
        .single()
    ).data!;
  const own = await pathOf(chipo.enrolmentId);
  const viaPage = await pathOf(tendai.enrolmentId);
  const theirs = await pathOf(tatenda.enrolmentId);
  expect([own.pdf_path, viaPage.pdf_path, theirs.pdf_path]).toEqual([null, null, null]);

  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const parent = await context.newPage();
  await signIn(parent, parentEmail);
  await expect(parent).toHaveURL("/children");

  // Another family's report: not found, and no PDF made for it.
  const pdf = (id: string) => parent.request.get(`/reports/${id}/pdf`, { maxRedirects: 0 });
  expect((await pdf(theirs.id)).status()).toBe(404);
  expect((await parent.goto(`/children/reports/${theirs.id}`))!.status()).toBe(404);
  expect((await pathOf(tatenda.enrolmentId)).pdf_path).toBeNull();

  // Their own, by the PDF route: made, stored and served.
  const opened = await pdf(own.id);
  expect(opened.status()).toBe(303);
  expect((await pathOf(chipo.enrolmentId)).pdf_path).toBeTruthy();
  const file = await parent.request.get(opened.headers()["location"]!);
  expect(file.headers()["content-type"]).toBe("application/pdf");

  // Their own, by the page: the PDF is made and Download PDF and sharing show.
  expect((await parent.goto(`/children/reports/${viaPage.id}`))!.status()).toBe(200);
  await expect(parent.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Share" })).toBeVisible();
  expect((await pathOf(tendai.enrolmentId)).pdf_path).toBeTruthy();
  await context.close();
});
