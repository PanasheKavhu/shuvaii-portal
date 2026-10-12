import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { readXlsx, type XlsxCell } from "../../src/lib/people/xlsx";
import { auditEventsAs, createMarksClass, PASSWORD, signIn, signedInClient } from "./helpers";
import { expectNoSideScroll } from "./report-helpers";

// Excel exports (US-9.4; D52) at 360 px (the mobile project) and on a
// desktop screen. Each test makes its own school, so the rows are known.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

/** Clicks a download button and returns the file's rows. */
async function download(page: Page, button: string): Promise<{ name: string; rows: XlsxCell[][] }> {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: button }).click(),
  ]);
  return {
    name: file.suggestedFilename(),
    rows: readXlsx(new Uint8Array(readFileSync(await file.path()))),
  };
}

test("the school admin downloads learners, marks and comments, each recorded in the audit log", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const school = await createMarksClass("exports", { learners: 3, marks: true });
  const [first] = school.learners;

  // A guardian whose name Excel would run as a formula, and comments.
  const admin = await signedInClient(school.adminEmail);
  const guardian = await admin
    .from("guardians")
    .insert({ school_id: school.schoolId, full_name: "=SUM(1,2)", phone: "0771000001" })
    .select("id")
    .single();
  expect(guardian.error).toBeNull();
  const link = await admin.from("guardian_links").insert({
    school_id: school.schoolId,
    guardian_id: guardian.data!.id,
    learner_id: first!.id,
    relationship: "mother",
    is_primary: true,
  });
  expect(link.error).toBeNull();
  const teacher = await signedInClient(school.teacherEmail);
  const comments = await Promise.all([
    teacher.from("subject_comments").insert({
      school_id: school.schoolId,
      term_id: school.termId,
      enrolment_id: first!.enrolmentId,
      class_subject_id: school.mathsId,
      comment: "Works hard.",
    }),
    teacher.from("class_comments").insert({
      school_id: school.schoolId,
      term_id: school.termId,
      enrolment_id: first!.enrolmentId,
      comment: "A good term.",
    }),
  ]);
  for (const c of comments) expect(c.error).toBeNull();

  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: /^Exports/ }).click();
  await expect(page.getByRole("heading", { name: "Exports", level: 1 })).toBeVisible();
  await expectNoSideScroll(page);

  const learners = await download(page, "Download learners");
  expect(learners.name).toMatch(/^learners-and-guardians-.*\.xlsx$/);
  expect(learners.rows[0]!.slice(0, 10)).toEqual([
    "Learner number",
    "Surname",
    "First name",
    "Date of birth",
    "Sex",
    "Status",
    "Admission date",
    "Class",
    "Year",
    "Guardian 1 name",
  ]);
  expect(learners.rows.slice(1).map((r) => r[0])).toEqual(["M001", "M002", "M003"]);
  const firstRow = learners.rows[1]!;
  expect(firstRow[7]).toBe("4 Blue");
  // Escaped, so it stays text (D37).
  expect(firstRow.slice(9, 14)).toEqual(["'=SUM(1,2)", "mother", "0771000001", null, "Yes"]);

  await page.getByLabel("Class", { exact: true }).selectOption({ label: "4 Blue" });
  const marks = await download(page, "Download marks");
  expect(marks.name).toMatch(/^marks-4-blue-.*\.xlsx$/);
  expect(marks.rows[0]).toEqual([
    "Learner number",
    "Surname",
    "First name",
    "Enrolment",
    "Mathematics: Test 1 (out of 30)",
    "Mathematics: Test 2 (out of 50)",
    "Mathematics: Exam (out of 100)",
  ]);
  expect(marks.rows).toHaveLength(4);
  for (const row of marks.rows.slice(1)) {
    expect(row[3]).toBe("Enrolled");
    for (const mark of row.slice(4)) expect(typeof mark).toBe("number");
  }

  const commentsFile = await download(page, "Download comments");
  expect(commentsFile.name).toMatch(/^comments-4-blue-.*\.xlsx$/);
  expect(commentsFile.rows[0]!.slice(4)).toEqual([
    "English comment",
    "Mathematics comment",
    "Class teacher's comment",
  ]);
  expect(commentsFile.rows[1]!.slice(0, 7)).toEqual([
    "M001",
    first!.name.split(" ")[1],
    first!.name.split(" ")[0],
    "Enrolled",
    null,
    "Works hard.",
    "A good term.",
  ]);

  // Each download is one audit row, shown in plain words.
  const events = await auditEventsAs(school.adminEmail, PASSWORD, school.schoolId);
  expect(events.filter((e) => e === "data_exported")).toHaveLength(3);
  await page.goto("/admin/audit");
  await expect(
    page.getByText("exported the learners and guardians to Excel (3 learners)"),
  ).toBeVisible();
  await expect(page.getByText(/exported 4 Blue's .* marks to Excel \(3 learners\)/)).toBeVisible();
  await expect(
    page.getByText(/exported 4 Blue's .* comments to Excel \(3 learners\)/),
  ).toBeVisible();
});

test("the head and teachers cannot open the exports or download a file", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("exports-denied", { head: true });

  await signIn(page, school.headEmail!);
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("link", { name: /^Exports/ })).toHaveCount(0);
  expect((await page.goto("/admin/exports"))?.status()).toBe(403);
  for (const form of [
    { kind: "learners" } as Record<string, string>,
    { kind: "marks", class: school.classId, term: school.termId },
  ]) {
    const res = await page.request.post("/admin/exports/download", {
      form,
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  }

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await signIn(teacher, school.teacherEmail);
  await expect(teacher).toHaveURL("/teaching");
  expect((await teacher.goto("/admin/exports"))?.status()).toBe(403);
  const res = await teacher.request.post("/admin/exports/download", {
    form: { kind: "learners" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
  await teacherContext.close();

  // Nothing was exported, so nothing was recorded.
  const events = await auditEventsAs(school.adminEmail, PASSWORD, school.schoolId);
  expect(events).not.toContain("data_exported");
});

test("a post from another site is refused before anything is read", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("exports-origin");
  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  const res = await page.request.post("/admin/exports/download", {
    form: { kind: "learners" },
    headers: { origin: "https://elsewhere.example" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
  const events = await auditEventsAs(school.adminEmail, PASSWORD, school.schoolId);
  expect(events).not.toContain("data_exported");
});
