import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { toCsvLine } from "../../src/lib/people/csv";
import { readUpload } from "../../src/lib/people/upload";
import { writeXlsx } from "../../src/lib/people/xlsx-write";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// US-4.3 marks upload and US-4.5 lock screens (D33) at 360 px (the mobile
// project) and on a desktop screen. Each test makes its own school, since
// marks are never deleted.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A grid cell; on a phone, picks its assessment first (one is shown at a time). */
async function cell(page: Page, assessment: string, learner: string) {
  if (isPhone(page)) {
    await page
      .getByRole("group", { name: "Assessment" })
      .getByRole("button", { name: new RegExp(`^${assessment} `) })
      .click();
  }
  return page.getByLabel(`${assessment} for ${learner}`);
}

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Marks pages" }).getByRole("link", { name });

/** Downloads the template and returns its rows as text. */
async function downloadTemplate(page: Page, link: string): Promise<string[][]> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: link }).click(),
  ]);
  const read = readUpload(new Uint8Array(readFileSync(await download.path())));
  if (!read.ok) throw new Error(read.error);
  return read.rows.map((r) => r.map((c) => (c === null ? "" : String(c))));
}

async function upload(page: Page, name: string, bytes: Uint8Array) {
  await page.getByLabel("Marks file (.xlsx or CSV)").setInputFiles({
    name,
    mimeType: name.endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "Upload and check" }).click();
}

test("a file with one bad row saves nothing and lists the problem; a clean file fills the grid", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("upload", { marks: true });
  const [chipo, farai, tatenda] = school.learners.map((l) => l.name) as [string, string, string];
  const gridPath = `/marks/${school.mathsId}/${school.termId}`;

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(gridPath);
  await tab(page, "Upload").click();
  await expect(page.getByRole("heading", { name: "1. Download the template" })).toBeVisible();

  // The template: learner numbers, names, one column per assessment with
  // its maximum, and the saved marks filled in.
  const template = await downloadTemplate(page, "Download template (Excel)");
  expect(template[0]).toEqual([
    "learner_number",
    "learner_name",
    "Test 1 (out of 30)",
    "Test 2 (out of 50)",
    "Exam (out of 100)",
  ]);
  expect(template.slice(1).map((r) => r.slice(0, 3))).toEqual([
    ["M001", chipo, "0"],
    ["M002", farai, "7"],
    ["M003", tatenda, "14"],
  ]);
  const csvTemplate = await downloadTemplate(page, "Download as CSV");
  expect(csvTemplate).toEqual(template);

  // One bad row (31 out of 30): nothing is saved and the row is named.
  const bad = template.map((r) => [...r]);
  bad[1]![2] = "25";
  bad[2]![2] = "31";
  await upload(page, "maths-marks.csv", new TextEncoder().encode(bad.map(toCsvLine).join("\n")));
  // The first check compiles the action on the dev server.
  await expect(page).toHaveURL(new RegExp(`${gridPath}/upload/[0-9a-f-]{36}$`), {
    timeout: 30_000,
  });
  await expect(page.getByRole("alert").filter({ hasText: "Nothing was saved" })).toContainText(
    "Nothing was saved. Fix this problem",
  );
  const problems = page.getByRole("list", { name: "Upload problems" });
  await expect(problems.getByRole("listitem")).toHaveCount(1);
  await expect(problems).toContainText("Row 3");
  await expect(problems).toContainText("Test 1: 31 is more than the maximum of 30.");
  await tab(page, "Marks").click();
  await expect(await cell(page, "Test 1", chipo)).toHaveValue("0");

  // A clean Excel file: a changed score, an absence and a decimal.
  await tab(page, "Upload").click();
  const clean = template.map((r) => [...r]);
  clean[1]![2] = "25";
  clean[2]![4] = "A";
  clean[3]![3] = "45.5";
  await upload(page, "maths-marks.xlsx", writeXlsx({ name: "Maths", rows: clean }));
  await expect(page.getByRole("heading", { name: "The file is clean." })).toBeVisible();
  await expect(page.getByRole("list", { name: "What will be saved" })).toContainText(
    "3 changed marks",
  );
  await page.getByRole("button", { name: "Save 3 marks" }).click();
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await page.getByRole("link", { name: "See the marks" }).click();
  await expect(page).toHaveURL(gridPath);
  await expect(await cell(page, "Test 1", chipo)).toHaveValue("25");
  await expect(await cell(page, "Exam", farai)).toHaveValue("A");
  await expect(await cell(page, "Test 2", tatenda)).toHaveValue("45.5");

  // Each saved mark is in the audit log as the teacher's change.
  const admin = await signedInClient(school.adminEmail);
  const teacher = await signedInClient(school.teacherEmail);
  const { data: me } = await teacher.auth.getUser();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("school_id", school.schoolId)
    .eq("table_name", "marks")
    .eq("actor_id", me.user!.id);
  expect(count).toBe(3);
});

test("after the deadline a teacher cannot edit; a head unlocks with a reason, the teacher can edit, and the reason is audited", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const school = await createMarksClass("uplock", { marks: true, head: true });
  const chipo = school.learners[0]!.name;
  const admin = await signedInClient(school.adminEmail);
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const { data: term, error } = await admin
    .from("terms")
    .update({ marks_deadline: yesterday })
    .eq("id", school.termId)
    .select("academic_year_id")
    .single();
  expect(error).toBeNull();
  const gridPath = `/marks/${school.mathsId}/${school.termId}`;

  // The teacher: a read-only grid and a closed upload, with why and who to ask.
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(gridPath);
  const notice = page.getByRole("status", { name: "Marks locked" });
  await expect(notice).toContainText("These marks are read-only because the marks deadline");
  await expect(notice).toContainText(`${school.headName} (head)`);
  await expect(await cell(page, "Test 1", chipo)).toHaveAttribute("readonly", "");
  await tab(page, "Upload").click();
  await expect(page.getByRole("status", { name: "Marks locked" })).toBeVisible();
  await expect(page.getByText("Uploading is closed while these marks are locked.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Upload marks" })).toHaveCount(0);

  // The head opens Mathematics from Marks and unlocks it with a reason.
  const headContext = await browser.newContext({ viewport: page.viewportSize()! });
  const headPage = await headContext.newPage();
  await signIn(headPage, school.headEmail!);
  await expect(headPage).toHaveURL("/head");
  await headPage.goto(`/marks?term=${school.termId}`);
  await headPage
    .getByRole("list", { name: "4 Blue subjects" })
    .getByRole("link", { name: /Mathematics/ })
    .click();
  const unlock = headPage.getByRole("form", { name: "Unlock marks" });
  await unlock.getByRole("button", { name: "Unlock for the teacher" }).click();
  await expect(unlock.getByRole("alert")).toContainText("Give a reason for unlocking.");
  const reason = "Exam scripts for 4 Blue came back late";
  await unlock.getByLabel("Reason for unlocking").fill(reason);
  await unlock.getByRole("button", { name: "Unlock for the teacher" }).click();
  await expect(headPage.getByRole("region", { name: "Marks unlocked" })).toContainText(reason);
  await headPage.goto(`/marks?term=${school.termId}`);
  await expect(headPage.getByRole("list", { name: "4 Blue subjects" })).toContainText(
    "Unlocked for the teacher",
  );

  // The teacher can now change marks, in the grid and by upload.
  await page.goto(gridPath);
  await expect(page.getByRole("region", { name: "Marks unlocked" })).toContainText(reason);
  const teacherCell = await cell(page, "Test 1", chipo);
  // Retried: on a busy dev server the grid (now with its comment column) can
  // hydrate after the first fill, which then never saves.
  await expect(async () => {
    await teacherCell.fill("");
    await teacherCell.fill("27");
    await expect(
      page.locator(`[id="${await teacherCell.getAttribute("aria-describedby")}"]`),
    ).toHaveText("Saved", { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await tab(page, "Upload").click();
  await expect(page.getByRole("form", { name: "Upload marks" })).toBeVisible();

  // The reason is in the audit log, read by the head.
  const head = await signedInClient(school.headEmail!);
  const { data: events } = await head
    .from("audit_log")
    .select("event, reason")
    .eq("school_id", school.schoolId)
    .eq("event", "marks_unlocked");
  expect(events).toEqual([{ event: "marks_unlocked", reason }]);

  // The school admin sees the unlock on the term in setup and relocks it there.
  const adminContext = await browser.newContext({ viewport: page.viewportSize()! });
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, school.adminEmail);
  await expect(adminPage).toHaveURL("/admin");
  await adminPage.goto(`/admin/setup/${term!.academic_year_id}/terms`);
  const unlocks = adminPage.getByRole("list", { name: "Unlocked class subjects in Term Now" });
  await expect(unlocks).toContainText("Mathematics, 4 Blue");
  await expect(unlocks).toContainText(`Unlocked by ${school.headName}`);
  await expect(unlocks).toContainText(reason);
  await unlocks.getByRole("button", { name: "Relock" }).click();
  await expect(adminPage.getByRole("region", { name: "Unlocked marks in Term Now" })).toContainText(
    "No class subjects are unlocked.",
  );

  await page.goto(gridPath);
  await expect(page.getByRole("status", { name: "Marks locked" })).toBeVisible();
  await expect(await cell(page, "Test 1", chipo)).toHaveValue("27");
  await expect(await cell(page, "Test 1", chipo)).toHaveAttribute("readonly", "");
  await headContext.close();
  await adminContext.close();
});
