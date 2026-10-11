import { expect, test, type Page } from "@playwright/test";
import { createMarksClass, signIn, signedInClient } from "./helpers";

// The report workflow (US-6.1, US-6.2, US-6.3, US-5.4; D44) at 360 px (the
// mobile project) and on a desktop screen. Each run makes its own school
// (createMarksClass), since reports are never deleted.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
});

/** Nothing on the page is hidden off to the side (rule 7). */
async function expectNoSideScroll(page: Page) {
  const hidden = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(hidden, "pixels of the page off to the side").toBeLessThanOrEqual(0);
}

test("a class's reports go from drafts to published, and a published report stays frozen", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  // Three learners with every Mathematics mark (English has no assessments,
  // so no result). Everyone's Mathematics comment is done; the class
  // teacher's comment is done for all but the first learner.
  const school = await createMarksClass("workflow", { marks: true, head: true });
  const [first, second] = school.learners as [
    (typeof school.learners)[number],
    (typeof school.learners)[number],
  ];
  const admin = await signedInClient(school.adminEmail);
  for (const l of school.learners) {
    const { error } = await admin.from("subject_comments").insert({
      school_id: school.schoolId,
      term_id: school.termId,
      enrolment_id: l.enrolmentId,
      class_subject_id: school.mathsId,
      comment: "Steady work in algebra.",
      status: "submitted",
    });
    expect(error).toBeNull();
  }
  for (const l of school.learners.slice(1)) {
    const { error } = await admin.from("class_comments").insert({
      school_id: school.schoolId,
      term_id: school.termId,
      enrolment_id: l.enrolmentId,
      comment: "A good term.",
      status: "submitted",
    });
    expect(error).toBeNull();
  }
  const classPage = `/marks/classes/${school.classId}/${school.termId}`;

  // The class teacher generates drafts: the first learner is listed with exactly what is missing.
  await signIn(page, school.teacherEmail);
  await expect(page).toHaveURL("/teaching");
  await page.goto(classPage);
  const reports = page.getByRole("region", { name: "Reports" });
  const generated = reports
    .getByRole("form", { name: "Generate draft reports" })
    .getByRole("status");
  const standing = reports.getByLabel("Where the reports stand");
  await reports.getByRole("button", { name: "Generate draft reports" }).click();
  await expect(generated).toHaveText("Made 2 draft reports. 1 learner is missing something.");
  await expect(standing).toHaveText("2 draft, 1 with no report yet");
  const missing = reports.getByRole("list", { name: "Learners missing something" });
  await expect(missing.getByRole("listitem").filter({ hasText: first.name })).toContainText(
    "No class teacher's comment",
  );
  await expect(missing).not.toContainText(second.name);
  await expectNoSideScroll(page);

  await reports.getByRole("button", { name: "Submit 2 reports to the head" }).click();
  await expect(standing).toHaveText("2 waiting for the head, 1 with no report yet");

  // The head returns them with a note.
  const headContext = await browser.newContext({ viewport: page.viewportSize()! });
  const head = await headContext.newPage();
  await signIn(head, school.headEmail!);
  await expect(head).toHaveURL("/head");
  await head
    .getByRole("list", { name: "Classes" })
    .getByRole("link", { name: /4 Blue/ })
    .click();
  await expect(head.getByRole("heading", { name: "4 Blue: reports" })).toBeVisible();
  await expect(head.getByText(`No report yet for ${first.name}.`)).toBeVisible();
  const returnForm = head.getByRole("form", { name: "Return reports" });
  await returnForm.getByLabel("Note to the class teacher").fill(`${first.name} has no report yet.`);
  await returnForm.getByRole("button", { name: "Return to the class teacher" }).click();
  const headStanding = head.getByLabel("Where the reports stand");
  await expect(headStanding).toHaveText("2 with the class teacher");
  await expectNoSideScroll(head);

  // The class teacher sees the note, writes the missing comment and resubmits.
  await page.reload();
  await expect(reports.getByRole("note", { name: "Note from the head" })).toContainText(
    `${first.name} has no report yet.`,
  );
  const label = `Class teacher's comment for ${first.name}`;
  await page.getByRole("textbox", { name: label, exact: true }).fill("Keep reading every day.");
  await page.getByRole("checkbox", { name: `Done with ${label}` }).check();
  await expect(
    page.getByRole("textbox", { name: label, exact: true }).locator("xpath=..").getByRole("status"),
  ).toHaveText("Saved and marked done");
  await reports.getByRole("button", { name: "Generate draft reports" }).click();
  await expect(generated).toHaveText("Made 1 draft report. Refreshed 2 drafts.");
  await expect(reports.getByRole("list", { name: "Learners missing something" })).toHaveCount(0);
  await reports.getByRole("button", { name: "Submit 3 reports to the head" }).click();
  await expect(standing).toHaveText("3 waiting for the head");

  // The head adds a comment, approves and publishes.
  await head.reload();
  const card = head.getByRole("article", { name: second.name });
  await card.getByLabel(`Head's comment for ${second.name}`).fill("A credit to the class.");
  await card.getByRole("button", { name: "Save comment" }).click();
  await expect(card.getByRole("status")).toHaveText("Head's comment saved.");
  await head.getByRole("button", { name: "Approve 3 reports" }).click();
  await expect(headStanding).toHaveText("3 approved");
  await head.getByRole("button", { name: "Publish 3 reports" }).click();
  await expect(headStanding).toHaveText("3 published");
  await head.reload();
  await expect(card).toContainText("Published");
  await expect(card).toContainText(/Reference [A-HJ-NP-Z2-9]{10}/);
  await expect(card).toContainText("A credit to the class.");
  await expectNoSideScroll(head);

  // The frozen snapshot, then a mark edited afterwards.
  const { data: before } = await admin
    .from("reports")
    .select("id, snapshot, reference_code, verification_code")
    .eq("enrolment_id", second.enrolmentId)
    .single();
  const frozenMark = (before!.snapshot as { subjects: { mark: number }[] }).subjects[0]!.mark;
  const mathsRow = card.getByRole("row", { name: /Mathematics/ });
  await expect(mathsRow).toContainText(String(frozenMark));

  const { data: exam } = await admin
    .from("assessments")
    .select("id")
    .eq("class_subject_id", school.mathsId)
    .eq("name", "Exam")
    .single();
  const edit = await admin
    .from("marks")
    .update({ score: 95 })
    .eq("assessment_id", exam!.id)
    .eq("enrolment_id", second.enrolmentId)
    .select("id");
  expect(edit.error).toBeNull();
  expect(edit.data).toHaveLength(1);
  const { data: live } = await admin.rpc("subject_results", {
    p_class_id: school.classId,
    p_term_id: school.termId,
  });
  const liveMark = live!.find((r) => r.enrolment_id === second.enrolmentId)!.rounded_mark;
  expect(liveMark).not.toBe(frozenMark);

  const { data: after } = await admin
    .from("reports")
    .select("id, snapshot, reference_code, verification_code")
    .eq("enrolment_id", second.enrolmentId)
    .single();
  expect(after).toEqual(before);
  await head.reload();
  await expect(mathsRow).toContainText(String(frozenMark));
  await expect(mathsRow).not.toContainText(String(liveMark));

  // Every step is in the audit log in plain words.
  await head.goto(`/admin/audit?class=${school.classId}`);
  const changes = head.getByRole("list", { name: "Changes" });
  await expect(changes).toContainText(`${school.headName} published ${second.name}'s report`);
  await expect(changes).toContainText(`${school.headName} approved ${second.name}'s report`);
  await expect(changes).toContainText(
    `${school.headName} wrote the head's comment on ${second.name}'s report`,
  );
  await expect(changes).toContainText(`${school.headName} returned ${second.name}'s report`);
  await expect(changes).toContainText(`${school.teacherName} submitted ${second.name}'s report`);
  await expect(changes).toContainText(
    `${school.teacherName} made a draft of ${first.name}'s report`,
  );
  await expect(changes).not.toContainText("{");
  await headContext.close();
});

test("a class teacher cannot approve or publish through the API", async () => {
  const school = await createMarksClass("workflow403", { marks: true });
  const teacher = await signedInClient(school.teacherEmail);
  for (const call of [
    teacher.rpc("publish_class_reports", { p_class_id: school.classId, p_term_id: school.termId }),
    teacher.rpc("approve_class_reports", { p_class_id: school.classId, p_term_id: school.termId }),
  ]) {
    const { error } = await call;
    expect(error?.code).toBe("42501");
  }
  // Nor by writing the table directly.
  const direct = await teacher
    .from("reports")
    .update({ status: "published" })
    .eq("school_id", school.schoolId);
  expect(direct.error?.code).toBe("42501");
});
