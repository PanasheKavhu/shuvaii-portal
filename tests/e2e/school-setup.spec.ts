import { expect, test, type Page } from "@playwright/test";
import { MSASA_TEACHER, createEmptySchool, signIn } from "./helpers";

// US-2.1 to US-2.4 on a phone-sized screen.
test.use({ viewport: { width: 360, height: 780 } });

const form = (page: Page, name: string) => page.getByRole("form", { name });
const steps = (page: Page) => page.getByRole("navigation", { name: "Setup steps" });

test("a school admin sets up a year from scratch; gaps block finishing until fixed", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const school = await createEmptySchool("setup");
  const thisYear = String(new Date().getFullYear());

  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "School setup" }).click();
  await expect(page.getByText("No academic years yet.")).toBeVisible();

  // Step 1: the wizard proposes three terms and a vacation period.
  await page.getByRole("link", { name: "Set up a new year" }).click();
  const newYear = form(page, "New academic year");
  await expect(newYear.getByLabel("Year", { exact: true })).toHaveValue(thisYear);
  await expect(newYear.getByLabel("Name")).toHaveCount(4);
  await expect(newYear.getByLabel("Name").nth(1)).toHaveValue(`April ${thisYear} Vacation School`);
  await expect(newYear.getByLabel("Kind").nth(1)).toHaveValue("vacation");
  // An edit: Term 1 opens for marks with a later deadline.
  await newYear.getByLabel("Status").first().selectOption("open");
  await newYear.getByLabel("Marks deadline").first().fill(`${thisYear}-03-31`);
  await page.getByRole("button", { name: "Create year and terms" }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/[0-9a-f-]{36}$/);
  const yearUrl = page.url();
  await expect(page.getByRole("heading", { name: `Academic year ${thisYear}` })).toBeVisible();
  await expect(page.getByRole("list", { name: "Setup gaps" })).toContainText(
    "The year has no classes yet.",
  );

  // Terms store status and marks deadline (US-2.4).
  await steps(page).getByRole("link", { name: "Year and terms" }).click();
  const term1 = form(page, `Term 1 ${thisYear}`);
  await expect(term1.getByLabel("Status")).toHaveValue("open");
  await expect(term1.getByLabel("Marks deadline")).toHaveValue(`${thisYear}-03-31`);
  await term1.getByLabel("Status").selectOption("locked");
  await term1.getByRole("button", { name: `Save Term 1 ${thisYear}` }).click();
  await expect(term1.getByRole("status")).toHaveText(`Term 1 ${thisYear} saved.`);

  // Step 2: a grading scale from the O-level template, then the band editor.
  await page.getByRole("link", { name: "Next: Grading scales" }).click();
  await page.getByRole("button", { name: "Create scale" }).click();
  await expect(page).toHaveURL(/\/grading\/[0-9a-f-]{36}$/);
  const check = page.getByRole("region", { name: "Band check" });
  await expect(check).toHaveText("Marks 0 to 100 are each in exactly one band.");
  await expect(page.getByLabel("Lowest mark, band 1")).toHaveValue("70");

  // The editor says exactly what is wrong.
  await page.getByLabel("Lowest mark, band 2").fill("62");
  await expect(check).toContainText("Gap: marks 60 to 61 are in no band.");
  await page.getByLabel("Lowest mark, band 2").fill("58");
  await expect(check).toContainText("Overlap: marks 58 to 59 are in more than one band (B and C).");
  await page.getByLabel("Lowest mark, band 2").fill("60");
  await page.getByLabel("Highest mark, band 1").fill("101");
  await expect(check).toContainText("Out of range: A (row 1) must stay between 0 and 100.");
  await page.getByRole("button", { name: "Save bands" }).click();
  await expect(page.getByRole("form", { name: "Grade bands" }).getByRole("status")).toHaveCount(0);
  await expect(page.getByText(/^Not saved\. Out of range/)).toBeVisible();
  await page.getByLabel("Highest mark, band 1").fill("100");
  await page.getByLabel("Make this the default scale for its stage").check();
  await page.getByRole("button", { name: "Save bands" }).click();
  await expect(
    page.getByText("Bands saved. They cover 0 to 100 with no gaps or overlaps."),
  ).toBeVisible();

  // Step 3: a grade level using that scale.
  await steps(page).getByRole("link", { name: "Grade levels" }).click();
  const addLevel = form(page, "Add a grade level");
  await addLevel.getByLabel("Name").fill("Form 1");
  await addLevel.getByRole("button", { name: "Add grade level" }).click();
  await expect(addLevel.getByRole("status")).toHaveText("Form 1 added.");

  // Step 4: subjects.
  await page.getByRole("link", { name: "Next: Subjects" }).click();
  const addSubject = form(page, "Add a subject");
  for (const [name, code] of [
    ["Mathematics", "math"],
    ["English Language", "ENG"],
  ]) {
    await addSubject.getByLabel("Name").fill(name!);
    await addSubject.getByLabel("Code").fill(code!);
    await addSubject.getByRole("button", { name: "Add subject" }).click();
    await expect(addSubject.getByRole("status")).toHaveText(`${name} added.`);
  }
  await expect(page.getByRole("list", { name: "Subjects" })).toContainText("MATH");

  // Step 5: two classes; only one has a class teacher so far.
  await page.getByRole("link", { name: "Next: Classes and class teachers" }).click();
  const addClass = form(page, "Add a class");
  await addClass.getByLabel("Class name").fill("1 Blue");
  await addClass.getByLabel("Class teacher").selectOption({ label: school.teacherName });
  await addClass.getByRole("button", { name: "Add class" }).click();
  await expect(addClass.getByRole("status")).toHaveText("1 Blue added.");
  await addClass.getByLabel("Class name").fill("1 Green");
  await addClass.getByRole("button", { name: "Add class" }).click();
  await expect(addClass.getByRole("status")).toHaveText("1 Green added.");

  // Step 6: one teacher takes subjects in both classes; English in 1 Green waits.
  await page.getByRole("link", { name: "Next: Class subjects and teachers" }).click();
  await page.getByRole("link", { name: /^1 Blue/ }).click();
  let add = form(page, "Add subjects");
  await add.getByLabel("Mathematics").check();
  await add.getByLabel("English Language").check();
  await add
    .getByLabel("Teacher for the ticked subjects")
    .selectOption({ label: school.teacherName });
  await add.getByRole("button", { name: "Add ticked subjects" }).click();
  await expect(
    page.getByRole("list", { name: "Subjects in 1 Blue" }).getByRole("listitem"),
  ).toHaveCount(2);

  await page.getByRole("link", { name: "← All classes" }).click();
  await page.getByRole("link", { name: /^1 Green/ }).click();
  add = form(page, "Add subjects");
  await add.getByLabel("Mathematics").check();
  await add
    .getByLabel("Teacher for the ticked subjects")
    .selectOption({ label: school.teacherName });
  await add.getByRole("button", { name: "Add ticked subjects" }).click();
  await expect(page.getByRole("list", { name: "Subjects in 1 Green" })).toContainText(
    "Mathematics",
  );
  add = form(page, "Add subjects");
  await add.getByLabel("English Language").check();
  await add.getByRole("button", { name: "Add ticked subjects" }).click();
  await expect(page.getByRole("list", { name: "Subjects in 1 Green" })).toContainText(
    "No teacher yet",
  );

  await page.getByRole("link", { name: "← All classes" }).click();
  await expect(page.getByText(`${school.teacherName}:`)).toContainText(
    "English Language (1 Blue), Mathematics (1 Blue), Mathematics (1 Green)",
  );

  // The gaps block finishing.
  await page.getByRole("link", { name: "Next: Check and finish" }).click();
  const gaps = page.getByRole("list", { name: "Setup gaps" });
  await expect(gaps.getByRole("listitem")).toHaveText([
    "1 Green has no class teacher.",
    "English Language in 1 Green has no teacher.",
  ]);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText(/^Setup cannot be finished yet\. 2 gaps need fixing/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Setup in progress")).toBeVisible();

  // Fix the gaps from the list: a head of department can be class teacher and teach.
  await gaps.getByRole("link", { name: "1 Green has no class teacher." }).click();
  const green = form(page, "1 Green");
  await green.getByLabel("Class teacher").selectOption({ label: `${school.hodName} (HOD)` });
  await green.getByRole("button", { name: "Save 1 Green" }).click();
  await expect(green.getByRole("status")).toHaveText("1 Green saved.");

  await page.goto(yearUrl);
  await gaps.getByRole("link", { name: "English Language in 1 Green has no teacher." }).click();
  const english = form(page, "Teacher for English Language");
  await english.getByLabel("Teacher for English Language").selectOption({
    label: `${school.hodName} (HOD)`,
  });
  await english.getByRole("button", { name: "Save teacher for English Language" }).click();
  await expect(english.getByRole("status")).toHaveText("Teacher saved.");

  await page.goto(yearUrl);
  await expect(page.getByRole("list", { name: "Setup gaps" })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText(/^Setup is finished./)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Set up · Current year")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish setup" })).toHaveCount(0);
});

test("a teacher gets 403 on the setup area", async ({ page }) => {
  await signIn(page, MSASA_TEACHER);
  await expect(page).not.toHaveURL(/sign-in/);
  for (const path of ["/admin/setup", "/admin/setup/new"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
  }
});
