import { expect, test, type Page } from "@playwright/test";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// US-5.1, US-5.2, US-5.3 at 360 px (the mobile project) and on a desktop
// screen. Each test makes its own school (createMarksClass), so runs never
// share comments, which are never deleted.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** The subject comment box of a learner on the marks grid (on a phone, shows its column first). */
async function subjectComment(page: Page, learner: string) {
  if (isPhone(page)) {
    await page
      .getByRole("group", { name: "Assessment" })
      .getByRole("button", { name: "Teacher's comment" })
      .click();
  }
  return page.getByRole("textbox", { name: `Teacher's comment for ${learner}`, exact: true });
}

const statusOf = (page: Page, label: string) =>
  page.getByRole("textbox", { name: label, exact: true }).locator("xpath=..").getByRole("status");

test("a teacher writes a subject comment beside the marks and marks it done", async ({ page }) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("comment", { marks: true });
  const learner = school.learners[0]!;
  const label = `Teacher's comment for ${learner.name}`;

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(`/marks/${school.mathsId}/${school.termId}`);
  const box = await subjectComment(page, learner.name);
  await expect(page.getByRole("columnheader", { name: /Teacher's comment/ })).toBeVisible();
  // Over the report's limit: counted and refused.
  await box.fill("x".repeat(101));
  await expect(page.getByText("1 character too many")).toBeVisible();
  await box.blur();
  await expect(statusOf(page, label)).toContainText("Use at most 100 characters");

  await box.fill("Good effort in algebra.");
  await expect(statusOf(page, label)).toHaveText("Saved as a draft");
  await page.getByRole("checkbox", { name: `Done with ${label}` }).check();
  await expect(statusOf(page, label)).toHaveText("Saved and marked done");

  const db = await signedInClient(school.adminEmail);
  const { data } = await db
    .from("subject_comments")
    .select("comment, status, signed_at")
    .eq("enrolment_id", learner.enrolmentId)
    .single();
  expect(data?.comment).toBe("Good effort in algebra.");
  expect(data?.status).toBe("submitted");
  expect(data?.signed_at).not.toBeNull();

  // After a reload it is still done; changing it makes it a draft again.
  await page.reload();
  const again = await subjectComment(page, learner.name);
  await expect(again).toHaveValue("Good effort in algebra.");
  await expect(page.getByRole("checkbox", { name: `Done with ${label}` })).toBeChecked();
  await again.fill("Good effort in algebra and graphs.");
  await expect(statusOf(page, label)).toHaveText("Saved as a draft");
  await expect(page.getByRole("checkbox", { name: `Done with ${label}` })).not.toBeChecked();
});

test("a teacher picks a bank comment matched to the learner's grade, then edits it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Every learner's Mathematics result is a U with the helper's marks.
  const school = await createMarksClass("bank", { marks: true });
  const learner = school.learners[0]!;
  const label = `Teacher's comment for ${learner.name}`;

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.getByRole("link", { name: "My comment bank" }).click();
  const form = page.getByRole("form", { name: "Add a comment" });
  for (const [text, grade] of [
    ["Revise every topic with a study partner.", "U"],
    ["Outstanding work this term.", "A"],
  ] as const) {
    await form.getByLabel("Comment").fill(text);
    await form.getByLabel("Subject").selectOption({ label: "Mathematics" });
    await form.getByLabel("Grade").selectOption(grade);
    await form.getByRole("button", { name: "Save comment" }).click();
    await expect(form.getByText("Saved to your comment bank.")).toBeVisible();
    await expect(page.getByRole("list", { name: "My comments" })).toContainText(text);
  }

  await page.goto(`/marks/${school.mathsId}/${school.termId}`);
  await subjectComment(page, learner.name);
  await page.getByRole("button", { name: `Suggestions (1) for ${label}` }).click();
  const suggestions = page.getByRole("list", { name: `Suggestions for ${label}` });
  await expect(suggestions.getByRole("button")).toHaveCount(1);
  await expect(suggestions).not.toContainText("Outstanding");
  await suggestions.getByRole("button", { name: /Revise every topic/ }).click();

  const box = page.getByRole("textbox", { name: label, exact: true });
  await expect(box).toHaveValue("Revise every topic with a study partner.");
  await expect(box).toBeFocused();
  await box.press("End");
  await box.pressSequentially(" Well done on the test.");
  await expect(statusOf(page, label)).toHaveText("Saved as a draft");

  const db = await signedInClient(school.adminEmail);
  const { data } = await db
    .from("subject_comments")
    .select("comment")
    .eq("enrolment_id", learner.enrolmentId)
    .single();
  expect(data?.comment).toBe("Revise every topic with a study partner. Well done on the test.");
  // Bank entries are private to the teacher unless shared, so the admin sees none.
  const bank = await db.from("comment_bank").select("text");
  expect(bank.data ?? []).toEqual([]);
});

test("the class teacher writes an overall comment beside each learner's results", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const school = await createMarksClass("classcomment", { marks: true, head: true });
  const learner = school.learners[1]!;
  const label = `Class teacher's comment for ${learner.name}`;

  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page
    .getByRole("list", { name: "My classes as class teacher" })
    .getByRole("link", { name: /4 Blue/ })
    .click();
  await expect(page.getByRole("heading", { name: "4 Blue: results and comments" })).toBeVisible();
  const card = page.getByRole("article", { name: learner.name });
  await expect(card.getByRole("table", { name: `Results for ${learner.name}` })).toContainText(
    "Mathematics",
  );
  await expect(card.getByLabel(`Average and position for ${learner.name}`)).toContainText(
    "Position",
  );

  await page
    .getByRole("textbox", { name: label, exact: true })
    .fill("A steady term. Keep reading every day.");
  await expect(statusOf(page, label)).toHaveText("Saved as a draft");
  await page.getByRole("checkbox", { name: `Done with ${label}` }).check();
  await expect(statusOf(page, label)).toHaveText("Saved and marked done");

  const db = await signedInClient(school.adminEmail);
  const { data } = await db
    .from("class_comments")
    .select("comment, status")
    .eq("enrolment_id", learner.enrolmentId)
    .single();
  expect(data).toEqual({ comment: "A steady term. Keep reading every day.", status: "submitted" });

  // The head reads it but cannot change it.
  const headContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const head = await headContext.newPage();
  await signIn(head, school.headEmail!);
  await expect(head).not.toHaveURL(/sign-in/);
  await head.goto(`/marks/classes/${school.classId}/${school.termId}`);
  const headBox = head.getByRole("textbox", { name: label, exact: true });
  await expect(headBox).toHaveValue("A steady term. Keep reading every day.");
  await expect(headBox).toHaveAttribute("readonly", "");
  await expect(head.getByRole("checkbox", { name: `Done with ${label}` })).toHaveCount(0);
  await headContext.close();
});

test("a teacher cannot open or write another class's comments", async ({ page }) => {
  const school = await createMarksClass("comment403", { secondClass: true });
  const green = school.secondClass!;
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await expect(
    page.getByRole("list", { name: "My classes as class teacher" }).getByRole("link"),
  ).toHaveCount(1);

  for (const path of [
    `/marks/classes/${green.classId}/${school.termId}`,
    `/marks/${green.mathsId}/${school.termId}`,
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  }

  // Nor through the API: the database refuses the write (RLS).
  const db = await signedInClient(school.teacherEmail);
  const { data: enrolment } = await (
    await signedInClient(school.adminEmail)
  )
    .from("enrolments")
    .select("id")
    .eq("class_id", green.classId)
    .single();
  const write = await db.from("class_comments").insert({
    school_id: school.schoolId,
    term_id: school.termId,
    enrolment_id: enrolment!.id,
    comment: "Not my class",
  });
  expect(write.error?.code).toBe("42501");
});
