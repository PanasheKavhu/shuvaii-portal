import { expect, test, type Page } from "@playwright/test";
import { buildXlsx } from "../unit/people/xlsx-fixture";
import { MSASA_ADMIN, MSASA_TEACHER, inviteTokenFor, signIn } from "./helpers";

// SPEC US-3.1 to US-3.4 on a phone-sized screen, against the seed school
// Msasa (2026 classes 3 Blue, 3 Green, 4 Blue). Every run uses fresh
// learner numbers, phones and emails, since learners are never deleted.
test.use({ viewport: { width: 360, height: 780 } });
// Each test walks several pages that the dev server compiles on first visit.
test.describe.configure({ timeout: 120_000 });

const LEARNER_HEADER =
  "learner_number,first_name,last_name,date_of_birth,sex,class,admission_date,guardian_name,guardian_relationship,guardian_phone,guardian_email";

function stamp(): string {
  return `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
}

async function upload(
  page: Page,
  form: "Import learners" | "Import staff",
  file: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  },
) {
  await page.goto("/admin/people/import");
  const upload = page.getByRole("form", { name: form });
  await upload
    .getByLabel(form === "Import learners" ? "Learners file" : "Staff file")
    .setInputFiles(file);
  await upload.getByRole("button", { name: /Upload and check/ }).click();
  await expect(page).toHaveURL(/\/admin\/people\/import\/[0-9a-f-]{36}$/);
}

async function findLearners(page: Page, query: string) {
  await page.goto(`/admin/people/learners?q=${encodeURIComponent(query)}&status=all`);
  return page.getByRole("list", { name: "Learners" });
}

test("a learners file with errors imports nothing and lists every problem by row", async ({
  page,
}) => {
  const s = stamp();
  const csv = [
    LEARNER_HEADER,
    // Fine on its own, but the file has errors, so it must not be imported.
    `E${s}1,Rudo,Moyo,2014-03-21,F,3 Blue,,Chipo Moyo,mother,077${s.slice(0, 7)},`,
    // Already used in the seed school.
    `MSH260001,Tawanda,Kanyemba,2012-02-13,M,3 Blue,,,,,`,
    `E${s}2,Tino,Dube,13/02/2014,M,9 Purple,,Mary Dube,mother,,mary@`,
    `E${s}1,Tari,Dube,2014-02-13,X,4 Blue,,,,,`,
  ].join("\n");

  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await upload(page, "Import learners", {
    name: "learners-with-errors.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText("Nothing was imported. Fix these 5 problems")).toBeVisible();
  const errors = page.getByRole("list", { name: "Import errors" });
  await expect(errors).toContainText("Row 3");
  await expect(errors).toContainText("Learner number MSH260001 already exists in the school.");
  await expect(errors).toContainText('Unknown class "9 Purple". Use a class from this year.');
  await expect(errors).toContainText('Guardian email "mary@" is not a valid email.');
  await expect(errors).toContainText(`Learner number E${s}1 is also on row 2.`);
  await expect(errors).toContainText('Sex "X" must be F or M.');
  await expect(page.getByRole("button", { name: "Import now" })).toHaveCount(0);

  await findLearners(page, `E${s}`);
  await expect(page.getByRole("status")).toHaveText("No learners match.");

  // The failed check is recorded in import_jobs.
  await page.goto("/admin/people/import");
  await expect(
    page.getByRole("link", { name: /Learners: learners-with-errors.csv/ }).first(),
  ).toContainText("Not imported");
});

test("a clean Excel file imports all learners, with siblings sharing one guardian", async ({
  page,
}) => {
  const s = stamp();
  const phone = `071${s.slice(0, 7)}`;
  const xlsx = buildXlsx([
    LEARNER_HEADER.split(","),
    [
      `C${s}1`,
      "Tatenda",
      "Gumbo",
      41000,
      "M",
      "3 Blue",
      null,
      "Nyasha Gumbo",
      "mother",
      phone,
      null,
    ],
    [
      `C${s}2`,
      "Tadiwa",
      "Gumbo",
      "2013-06-01",
      "F",
      "4 Blue",
      null,
      "Nyasha Gumbo",
      "mother",
      `+263 ${phone.slice(1)}`,
      null,
    ],
    [`C${s}3`, "Anesu", "Sibanda", "2012-09-09", "F", "3 green", null, null, null, null, null],
  ]);

  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await upload(page, "Import learners", {
    name: "clean-learners.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(xlsx),
  });

  const summary = page.getByRole("list", { name: "What will be imported" });
  await expect(summary).toContainText("3 learners");
  await expect(summary).toContainText("3 Blue: 1");
  await expect(summary).toContainText("1 new guardian");
  await expect(summary).toContainText("1 guardian linked to more than one child");

  await page.getByRole("button", { name: "Import now" }).click();
  await expect(page.getByRole("heading", { name: "Imported", exact: true })).toBeVisible();

  const list = await findLearners(page, `C${s}`);
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list).toContainText("Gumbo, Tatenda");
  await expect(list).toContainText("Sibanda, Anesu");
  await expect(list).toContainText("3 Green");

  await list.getByRole("link", { name: /Gumbo, Tatenda/ }).click();
  await expect(page.getByRole("heading", { name: "Tatenda Gumbo" })).toBeVisible();
  await expect(page.getByLabel("Date of birth")).toHaveValue("2012-04-01");
  const guardians = page.getByRole("list", { name: "Guardians" });
  await expect(guardians).toContainText("Nyasha Gumbo");
  await expect(guardians).toContainText("Also guardian of Tadiwa Gumbo");
});

test("an admin adds a learner with a guardian, chooses subjects and marks them as left", async ({
  page,
}) => {
  const s = stamp();
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "People" }).click();
  await page.getByRole("link", { name: "Add a learner" }).click();

  const form = page.getByRole("form", { name: "Add a learner" });
  await form.getByLabel("Learner number").fill(`M${s}`);
  await form.getByLabel("First name").fill("Farai");
  await form.getByLabel("Last name").fill("Mutasa");
  await form.getByLabel("Sex").selectOption("M");
  await form.getByLabel("Class in 2026").selectOption({ label: "4 Blue" });
  await form.getByLabel("Guardian's full name").fill("Grace Mutasa");
  await form.getByLabel("Phone").fill("0772 bad");
  await form.getByRole("button", { name: "Add learner" }).click();
  await expect(form.getByRole("alert").first()).toContainText(
    "Phone: Enter a phone number such as 0772 123 456.",
  );
  await form.getByLabel("Phone").fill(`078${s.slice(0, 7)}`);
  await form.getByRole("button", { name: "Add learner" }).click();

  await expect(page.getByRole("heading", { name: "Farai Mutasa" })).toBeVisible();
  await expect(page.getByText("Learner added.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Guardians" })).toContainText("Grace Mutasa");

  // US-3.4: a secondary learner starts with no subjects and takes only 4 Blue's.
  const subjects = page.getByRole("form", { name: "Subjects" });
  await expect(subjects.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await subjects.getByLabel("Mathematics").check();
  await subjects.getByLabel("English Language").check();
  await subjects.getByRole("button", { name: "Save subjects" }).click();
  await expect(subjects.getByRole("status")).toHaveText("2 subjects saved.");
  await page.reload();
  await expect(
    page.getByRole("form", { name: "Subjects" }).getByRole("checkbox", { checked: true }),
  ).toHaveCount(2);

  // A leaver is marked, never deleted.
  const details = page.getByRole("form", { name: "Learner details" });
  await details.getByLabel("Status").selectOption("left");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByRole("status")).toHaveText("Farai Mutasa saved.");

  await page.goto(`/admin/people/learners?q=M${s}`);
  await expect(page.getByRole("status")).toHaveText("No learners match.");
  const all = await findLearners(page, `M${s}`);
  await expect(all).toContainText("Left the school");
});

test("a staff file is checked, then imported as invited staff who can be sent the invite again", async ({
  page,
}) => {
  const s = stamp();
  const first = `rudo-${s}@demo.spportal.test`;
  const second = `tendai-${s}@demo.spportal.test`;

  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");

  // Errors first: nothing is imported.
  await upload(page, "Import staff", {
    name: "staff-errors.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `full_name,email,phone,role\nRudo Moyo,${first},,teacher\nTino Dube,tino@,,bursar\n`,
    ),
  });
  const errors = page.getByRole("list", { name: "Import errors" });
  await expect(errors).toContainText('Email "tino@" is not a valid email.');
  await expect(errors).toContainText('Unknown role "bursar".');

  await upload(page, "Import staff", {
    name: "staff.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Full name,Email,Phone,Role\nRudo Moyo ${s},${first},0772 123 456,Teacher\nTendai Ncube ${s},${second},,HOD\n`,
    ),
  });
  await expect(page.getByRole("list", { name: "What will be imported" })).toContainText(
    "2 staff roles",
  );
  await page.getByRole("button", { name: "Import now" }).click();
  await expect(page.getByRole("heading", { name: "Imported", exact: true })).toBeVisible();
  await inviteTokenFor(first);

  await page.goto(`/admin/people/staff?q=${s}`);
  const staff = page.getByRole("list", { name: "Staff" });
  await expect(staff.getByRole("listitem")).toHaveCount(2);
  await expect(staff).toContainText("Head of department");
  await expect(staff).toContainText("Invited");

  await staff.getByRole("link", { name: new RegExp(`Rudo Moyo ${s}`) }).click();
  await page.getByRole("button", { name: `Resend invite to ${first}` }).click();
  await expect(page.getByText(`Invite sent again to ${first}.`)).toBeVisible();

  // A leaver's role is disabled, not deleted.
  await page.getByRole("button", { name: "Disable teacher" }).click();
  await expect(page.getByText("Teacher access disabled.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Roles" })).toContainText("Disabled");
});

test("a teacher gets 403 on the people pages", async ({ page }) => {
  await signIn(page, MSASA_TEACHER);
  await expect(page).not.toHaveURL(/sign-in/);
  for (const path of ["/admin/people/learners", "/admin/people/staff", "/admin/people/import"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
  }
});
