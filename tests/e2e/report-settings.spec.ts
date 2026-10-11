import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createEmptySchool, signIn, signedInClient } from "./helpers";

// Report settings in /admin/setup (D43) at 360 px (the mobile project) and on
// a desktop screen. Each test makes its own school, which gets its three
// report templates from the database.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const LOGO = readFileSync("tests/e2e/fixtures/logo.png");

test("a school admin sets what each report shows and uploads the stamp and signature", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const school = await createEmptySchool("reports");
  await signIn(page, school.adminEmail);
  await expect(page).not.toHaveURL(/sign-in/);

  await page.goto("/admin/setup");
  await page.getByRole("link", { name: "Report settings" }).click();
  await expect(page.getByRole("heading", { name: "Report settings" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "pixels of the page off to the side").toBeLessThanOrEqual(0);

  // Defaults from REPORT_LAYOUT.md section 2.
  const term = page.getByRole("form", { name: "Term report" });
  const vacation = page.getByRole("form", { name: "Vacation school report" });
  await expect(term.getByRole("checkbox", { name: "Class average and position" })).toBeChecked();
  await expect(term.getByRole("checkbox", { name: "Class teacher's comment" })).toBeChecked();
  await expect(term.getByRole("textbox", { name: "Comment column heading" })).toHaveValue(
    "Teacher's comment",
  );
  await expect(vacation.getByRole("checkbox", { name: "Class average and position" })).toHaveCount(
    0,
  );
  await expect(
    vacation.getByText("Vacation school has no class average or position."),
  ).toBeVisible();
  await expect(vacation.getByRole("checkbox", { name: "Head's comment" })).not.toBeChecked();
  await expect(vacation.getByRole("checkbox", { name: "School stamp" })).toBeChecked();

  // Change the term report: no grading key, "Tutor's comment", a new footer.
  await term.getByRole("checkbox", { name: "Grading key" }).uncheck();
  await term.getByRole("textbox", { name: "Comment column heading" }).fill("Tutor's comment");
  await term.getByRole("textbox", { name: "Footer text" }).fill("");
  await term.getByRole("button", { name: "Save term report" }).click();
  await expect(
    term.getByText("Enter the footer text, or switch the legal line off."),
  ).toBeVisible();
  await term
    .getByRole("textbox", { name: "Footer text" })
    .fill("Issued by Setup School without erasure.");
  await term.getByRole("button", { name: "Save term report" }).click();
  await expect(term.getByText("Term report settings saved.")).toBeVisible();

  await page.reload();
  await expect(term.getByRole("checkbox", { name: "Grading key" })).not.toBeChecked();
  await expect(term.getByRole("textbox", { name: "Comment column heading" })).toHaveValue(
    "Tutor's comment",
  );
  await expect(term.getByRole("textbox", { name: "Footer text" })).toHaveValue(
    "Issued by Setup School without erasure.",
  );
  await expect(vacation.getByRole("checkbox", { name: "Grading key" })).toBeChecked();

  // Stamp and signature: a text file named .png is refused; real images are kept.
  const stamp = page.getByRole("form", { name: "School stamp image" });
  await expect(page.getByText("No school stamp yet.")).toBeVisible();
  await stamp.getByLabel("School stamp image").setInputFiles({
    name: "stamp.png",
    mimeType: "image/png",
    buffer: Buffer.from("not really an image"),
  });
  await stamp.getByRole("button", { name: "Upload school stamp" }).click();
  await expect(stamp.getByText("Upload a PNG, JPEG or WebP image.")).toBeVisible();
  await stamp.getByLabel("School stamp image").setInputFiles({
    name: "stamp.png",
    mimeType: "image/png",
    buffer: LOGO,
  });
  await stamp.getByRole("button", { name: "Upload school stamp" }).click();
  await expect(stamp.getByText("School stamp uploaded.")).toBeVisible();

  const signature = page.getByRole("form", { name: "Head's signature image" });
  await signature.getByLabel("Head's signature image").setInputFiles({
    name: "signature.png",
    mimeType: "image/png",
    buffer: LOGO,
  });
  await signature.getByRole("button", { name: "Upload head's signature" }).click();
  await expect(signature.getByText("Head's signature uploaded.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^School stamp uploaded \d+ \w+ \d{4}\.$/)).toBeVisible();
  await expect(page.getByText(/^Head's signature uploaded \d+ \w+ \d{4}\.$/)).toBeVisible();

  // The images are private: not even the school admin can read them back.
  const db = await signedInClient(school.adminEmail);
  const { data: row } = await db
    .from("schools")
    .select("stamp_path, head_signature_path")
    .eq("id", school.schoolId)
    .single();
  expect(row?.stamp_path).toMatch(new RegExp(`^${school.schoolId}/stamp-\\d+\\.png$`));
  expect(row?.head_signature_path).toMatch(
    new RegExp(`^${school.schoolId}/head-signature-\\d+\\.png$`),
  );
  const download = await db.storage.from("report-assets").download(row!.stamp_path!);
  expect(download.error).not.toBeNull();
});

test("only the school admin opens report settings", async ({ page }) => {
  const school = await createEmptySchool("reports-403");
  await signIn(page, school.teacherEmail);
  await expect(page).not.toHaveURL(/sign-in/);
  const res = await page.goto("/admin/setup/reports");
  expect(res?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();

  // Nor can a teacher change a template or upload a stamp through the API.
  const db = await signedInClient(school.teacherEmail);
  const { data } = await db
    .from("report_templates")
    .update({ footer_text: "Hacked" })
    .eq("school_id", school.schoolId)
    .select("id");
  expect(data).toEqual([]);
  const upload = await db.storage
    .from("report-assets")
    .upload(`${school.schoolId}/stamp-${Date.now()}.png`, LOGO, { contentType: "image/png" });
  expect(upload.error).not.toBeNull();
});
