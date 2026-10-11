import { expect, test } from "@playwright/test";
import { readPdf, flatText } from "../unit/reports/pdf-text";
import { signIn } from "./helpers";
import { approvedClass, expectNoSideScroll, serviceClient, someAddress } from "./report-helpers";

// Report PDFs and verification (US-6.3, US-6.4, US-6.5; D45) at 360 px (the
// mobile project) and on a desktop screen: the head publishes a class and
// its PDFs are made with progress, a PDF opens and says what the snapshot
// says, the address beside its QR code opens the public check page, and
// unknown codes are "not found" (withdrawn ones: report-withdraw.spec.ts).
// Each run makes its own school, since reports are never deleted.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

test("publishing a class makes its PDFs; a PDF opens and its QR address checks out", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const school = await approvedClass("pdfs");
  const second = school.learners[1]!;

  await signIn(page, school.headEmail!);
  await expect(page).toHaveURL("/head");
  await page.goto(`/head/reports/${school.classId}/${school.termId}`);
  await page.getByRole("button", { name: "Publish 3 reports" }).click();
  const pdfs = page.getByRole("region", { name: "Report PDFs" });
  await expect(pdfs.getByRole("status")).toHaveText("3 of 3 report PDFs ready.", {
    timeout: 60_000,
  });
  await expect(pdfs.getByRole("progressbar", { name: "Report PDFs made" })).toHaveAttribute(
    "value",
    "3",
  );
  await expectNoSideScroll(page);

  // Each report's PDF was made once and recorded at its path.
  const service = serviceClient();
  const { data: rows } = await service
    .from("reports")
    .select("id, enrolment_id, pdf_path, reference_code, verification_code, version, status")
    .eq("school_id", school.schoolId);
  expect(rows).toHaveLength(3);
  for (const r of rows!) {
    expect(r.status).toBe("published");
    expect(r.pdf_path).toBe(`${school.schoolId}/${r.id}/v${r.version}.pdf`);
  }
  const report = rows!.find((r) => r.enrolment_id === second.enrolmentId)!;

  // Open the PDF from the learner's card.
  const card = page.getByRole("article", { name: second.name });
  const open = card.getByRole("link", { name: `Open PDF of ${second.name}'s report` });
  await expect(open).toBeVisible();
  const href = await open.getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  // Not kept in a shared device's or proxy's cache after the link expires.
  expect(response.headers()["cache-control"]).toBe("max-age=0");
  const pdf = readPdf(await response.body());
  const text = flatText(pdf);
  for (const expected of [
    school.schoolName,
    second.name,
    "4 Blue",
    "Term Now",
    "Mathematics",
    "Steady work in algebra.",
    "Class teacher's comment A good term.",
    "Grading key",
    "This report is issued without erasure or amendments.",
    `Reference ${report.reference_code}`,
    "Implemented by Panashe and Shuvai 2026",
  ])
    expect(text).toContain(expected);

  // Nobody signed out can open it.
  const stranger = await browser.newContext();
  expect((await stranger.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);

  // Scan path: the address printed beside the QR code (the same text it encodes).
  const printed = /Check this report: (\S+)/.exec(text)?.[1];
  expect(printed).toBe(`${baseURL}/verify/${report.verification_code}`);
  await stranger.setExtraHTTPHeaders({ "x-forwarded-for": someAddress() });
  const visitor = await stranger.newPage();
  if (page.viewportSize()!.width === 360)
    await visitor.setViewportSize({ width: 360, height: 780 });
  await visitor.goto(printed!);
  await expect(visitor.getByRole("heading", { name: "Report verified" })).toBeVisible();
  const details = visitor.getByLabel("Report details");
  await expect(details.locator("dt")).toHaveText([
    "Reference",
    "Learner",
    "School",
    "Term",
    "Status",
  ]);
  await expect(details.locator("dd")).toHaveText([
    report.reference_code!,
    second.name,
    school.schoolName,
    "Term Now",
    "Valid: published by the school",
  ]);
  await expect(visitor.getByText("Implemented by Panashe and Shuvai 2026")).toBeVisible();
  await expectNoSideScroll(visitor);

  await stranger.close();
});

test("an unknown or mistyped code shows not found, with no sign in", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const page = await context.newPage();
  for (const code of ["ABCDEFGHJKLMNPQRSTUVWXYZ", "not-a-code"]) {
    await page.goto(`/verify/${code}`);
    await expect(page).toHaveURL(`/verify/${code}`);
    await expect(page.getByRole("heading", { name: "Report not found" })).toBeVisible();
  }
  await context.close();
});

test("checks are limited per network address", async ({ request }) => {
  const address = someAddress();
  const headers = { "x-forwarded-for": address };
  for (let i = 0; i < 30; i++) {
    const r = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", { headers });
    expect(await r.text()).toContain("Report not found");
  }
  const blocked = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", { headers });
  expect(await blocked.text()).toContain("Too many reports were checked from your network.");
  // Writing another address in front of the real one does not get round it.
  const forged = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", {
    headers: { "x-forwarded-for": `${someAddress()}, ${address}` },
  });
  expect(await forged.text()).toContain("Too many reports were checked from your network.");
  // Another address is not affected.
  const other = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", {
    headers: { "x-forwarded-for": someAddress() },
  });
  expect(await other.text()).toContain("Report not found");
});
