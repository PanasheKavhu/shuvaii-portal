import { expect, test } from "@playwright/test";
import { signIn, signedInClient } from "./helpers";
import {
  approvedClass,
  parentOf,
  publishWithPdfs,
  serviceClient,
  someAddress,
} from "./report-helpers";

// Phase 4 gate: a parent cannot reach another family's report by any
// route (the page, the PDF route, the API, the stored file, share links),
// nor can another school's head; and a withdrawn report's PDF is gone for
// the family. One report of each kind is checked against its own family
// first, so a 404 means "not yours", not "broken".

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

test("another family and another school reach no report by any route", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const school = await approvedClass("isolation");
  const [chipo, , tatenda] = school.learners as [
    (typeof school.learners)[0],
    (typeof school.learners)[0],
    (typeof school.learners)[0],
  ];
  const parentEmail = await parentOf(school.schoolId, [chipo.id], "isolation");
  const otherParentEmail = await parentOf(school.schoolId, [tatenda.id], "isolation-other");
  await publishWithPdfs(page, school, 3);
  const { data: rows } = await serviceClient()
    .from("reports")
    .select("id, enrolment_id, pdf_path")
    .in("enrolment_id", [chipo.enrolmentId, tatenda.enrolmentId]);
  const own = rows!.find((r) => r.enrolment_id === chipo.enrolmentId)!;
  const theirs = rows!.find((r) => r.enrolment_id === tatenda.enrolmentId)!;
  expect(own.pdf_path && theirs.pdf_path).toBeTruthy();

  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const parent = await context.newPage();
  await signIn(parent, parentEmail);
  await expect(parent).toHaveURL("/children");

  // The page.
  expect((await parent.goto(`/children/reports/${own.id}`))!.status()).toBe(200);
  expect((await parent.goto(`/children/reports/${theirs.id}`))!.status()).toBe(404);
  // The learner's page is not a parent's area at all.
  expect([403, 404]).toContain((await parent.goto(`/my-reports/${theirs.id}`))!.status());

  // The PDF route: a redirect to the file for their own, 404 for another family's.
  const pdf = (id: string) => parent.request.get(`/reports/${id}/pdf`, { maxRedirects: 0 });
  const ownPdf = await pdf(own.id);
  expect(ownPdf.status()).toBe(303);
  expect(ownPdf.headers()["cache-control"]).toBe("private, no-store");
  expect((await pdf(theirs.id)).status()).toBe(404);
  expect(
    (
      await parent.request.get(`/reports/${theirs.id}/pdf?download=1`, { maxRedirects: 0 })
    ).status(),
  ).toBe(404);

  // The API, as the parent's own signed-in client.
  const api = await signedInClient(parentEmail);
  const read = await api.from("reports").select("id").in("id", [own.id, theirs.id]);
  expect(read.data!.map((r) => r.id)).toEqual([own.id]);
  const listed = await api.rpc("portal_reports", { p_school_id: school.schoolId });
  expect(listed.data!.map((r) => r.report_id)).toEqual([own.id]);

  // The stored file: no signed URL and no download of another family's path.
  const files = api.storage.from("reports");
  expect((await files.createSignedUrl(own.pdf_path!, 60)).error).toBeNull();
  expect((await files.createSignedUrl(theirs.pdf_path!, 60)).data).toBeNull();
  expect((await files.download(theirs.pdf_path!)).data).toBeNull();
  expect((await files.list(`${school.schoolId}/${theirs.id}`)).data ?? []).toEqual([]);

  // Share links: none can be made for another family's report, and another
  // family's link can be neither listed nor revoked.
  const made = await api.rpc("create_report_share", { p_report_id: theirs.id });
  expect(made.error?.code).toBe("42501");
  const other = await signedInClient(otherParentEmail);
  const theirLink = await other.rpc("create_report_share", { p_report_id: theirs.id });
  expect(theirLink.error).toBeNull();
  const shareId = theirLink.data![0]!.share_id;
  expect((await api.rpc("my_report_shares", { p_report_id: theirs.id })).data).toEqual([]);
  expect((await api.rpc("revoke_report_share", { p_share_id: shareId })).error?.code).toBe("42501");
  expect((await other.rpc("my_report_shares", { p_report_id: theirs.id })).data).toHaveLength(1);
  expect(
    (await api.from("report_shares").select("id")).error,
    "report_shares has no API access",
  ).not.toBeNull();

  // Another school's head: nothing through the PDF route, the API or the file.
  const elsewhere = await approvedClass("isolation-school");
  const headContext = await browser.newContext();
  const head = await headContext.newPage();
  await signIn(head, elsewhere.headEmail!);
  await expect(head).toHaveURL("/admin");
  expect((await head.request.get(`/reports/${theirs.id}/pdf`, { maxRedirects: 0 })).status()).toBe(
    404,
  );
  const headApi = await signedInClient(elsewhere.headEmail!);
  expect((await headApi.from("reports").select("id").eq("id", theirs.id)).data).toEqual([]);
  expect(
    (await headApi.storage.from("reports").createSignedUrl(theirs.pdf_path!, 60)).data,
  ).toBeNull();

  // Withdrawn: the family's PDF route stops at once.
  const ownHead = await signedInClient(school.headEmail!);
  expect(
    (await ownHead.rpc("withdraw_report", { p_report_id: own.id, p_reason: "Wrong mark." })).error,
  ).toBeNull();
  expect((await pdf(own.id)).status()).toBe(404);
  expect((await files.createSignedUrl(own.pdf_path!, 60)).data).toBeNull();

  await context.close();
  await headContext.close();
});
