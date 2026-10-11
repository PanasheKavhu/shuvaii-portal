import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";
import { readPdf, flatText } from "../unit/reports/pdf-text";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// Report PDFs and verification (US-6.3, US-6.4, US-6.5; D45) at 360 px (the
// mobile project) and on a desktop screen: the head publishes a class and
// its PDFs are made with progress, a PDF opens and says what the snapshot
// says, the address beside its QR code opens the public check page, and
// unknown or withdrawn codes are "not found or withdrawn". Each run makes
// its own school, since reports are never deleted.

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

function serviceClient() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** A network address of its own per test, so lookups from other runs do not count (D45). */
const someAddress = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function expectNoSideScroll(page: Page) {
  const hidden = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(hidden, "pixels of the page off to the side").toBeLessThanOrEqual(0);
}

/** A class whose three reports are approved and waiting to be published. */
async function approvedClass(prefix: string) {
  const school = await createMarksClass(prefix, { marks: true, head: true });
  const admin = await signedInClient(school.adminEmail);
  for (const l of school.learners) {
    for (const insert of [
      admin.from("subject_comments").insert({
        school_id: school.schoolId,
        term_id: school.termId,
        enrolment_id: l.enrolmentId,
        class_subject_id: school.mathsId,
        comment: "Steady work in algebra.",
        status: "submitted",
      }),
      admin.from("class_comments").insert({
        school_id: school.schoolId,
        term_id: school.termId,
        enrolment_id: l.enrolmentId,
        comment: "A good term.",
        status: "submitted",
      }),
    ])
      expect((await insert).error).toBeNull();
  }
  const teacher = await signedInClient(school.teacherEmail);
  const args = { p_class_id: school.classId, p_term_id: school.termId };
  // English has no assessments yet, so only Mathematics is on the reports.
  expect(
    (await teacher.rpc("generate_report_drafts", { ...args, p_include_incomplete_results: false }))
      .error,
  ).toBeNull();
  expect((await teacher.rpc("submit_class_reports", args)).error).toBeNull();
  const head = await signedInClient(school.headEmail!);
  expect((await head.rpc("approve_class_reports", args)).error).toBeNull();
  const { data: s } = await admin.from("schools").select("name").eq("id", school.schoolId).single();
  return { ...school, schoolName: s!.name };
}

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

  // Withdrawn by the school (the server, until US-6.6): the same address no longer checks out.
  const withdraw = await service
    .from("reports")
    .update({ status: "withdrawn", withdrawn_reason: "Wrong mark in Mathematics." })
    .eq("id", report.id)
    .select("id");
  expect(withdraw.error).toBeNull();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "Report not found or withdrawn" }),
  ).toBeVisible();
  await expect(visitor.getByText(second.name)).toHaveCount(0);
  await stranger.close();
});

test("an unknown or mistyped code shows not found or withdrawn, with no sign in", async ({
  browser,
}) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": someAddress() },
  });
  const page = await context.newPage();
  for (const code of ["ABCDEFGHJKLMNPQRSTUVWXYZ", "not-a-code"]) {
    await page.goto(`/verify/${code}`);
    await expect(page).toHaveURL(`/verify/${code}`);
    await expect(
      page.getByRole("heading", { name: "Report not found or withdrawn" }),
    ).toBeVisible();
  }
  await context.close();
});

test("checks are limited per network address", async ({ request }) => {
  const address = someAddress();
  const headers = { "x-forwarded-for": address };
  for (let i = 0; i < 30; i++) {
    const r = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", { headers });
    expect(await r.text()).toContain("Report not found or withdrawn");
  }
  const blocked = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", { headers });
  expect(await blocked.text()).toContain("Too many reports were checked from your network.");
  // Another address is not affected.
  const other = await request.get("/verify/ABCDEFGHJKLMNPQRSTUVWXYZ", {
    headers: { "x-forwarded-for": someAddress() },
  });
  expect(await other.text()).toContain("Report not found or withdrawn");
});
