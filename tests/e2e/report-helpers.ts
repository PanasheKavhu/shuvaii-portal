import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";
import { createMarksClass, createTestAccount, signIn, signedInClient } from "./helpers";

// Shared by the report specs (report-pdfs, report-withdraw).

/** The local service-role client, for checks the app's users cannot make. */
export function serviceClient() {
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
export const someAddress = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export async function expectNoSideScroll(page: Page) {
  const hidden = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(hidden, "pixels of the page off to the side").toBeLessThanOrEqual(0);
}

/** A class whose three reports are approved and waiting to be published, optionally with its own grade names. */
export async function approvedClass(prefix: string, options: { grades?: string[] } = {}) {
  const school = await createMarksClass(prefix, { marks: true, head: true });
  const admin = await signedInClient(school.adminEmail);
  if (options.grades) {
    // The school's own key: the six bands, highest first, renamed before any draft is made.
    const { data: bands } = await admin
      .from("grading_bands")
      .select("id")
      .eq("school_id", school.schoolId)
      .order("min_mark", { ascending: false });
    expect(bands).toHaveLength(options.grades.length);
    for (const [i, b] of bands!.entries())
      expect(
        (await admin.from("grading_bands").update({ grade: options.grades[i]! }).eq("id", b.id))
          .error,
      ).toBeNull();
  }
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

/** A parent login linked to each of `learnerIds`, made with the local service role as the seed does. */
export async function parentOf(schoolId: string, learnerIds: string[], prefix: string) {
  const email = `${prefix}-parent-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.spportal.test`;
  const userId = await createTestAccount(email, "Rudo Parent");
  const service = serviceClient();
  expect(
    (
      await service
        .from("memberships")
        .insert({ school_id: schoolId, user_id: userId, role: "parent", status: "active" })
    ).error,
  ).toBeNull();
  const { data: guardian, error } = await service
    .from("guardians")
    .insert({ school_id: schoolId, full_name: "Rudo Parent", user_id: userId })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(
    (
      await service.from("guardian_links").insert(
        learnerIds.map((learnerId) => ({
          school_id: schoolId,
          guardian_id: guardian!.id,
          learner_id: learnerId,
          relationship: "mother" as const,
          is_primary: true,
        })),
      )
    ).error,
  ).toBeNull();
  return email;
}

/** Publishes an approved class from the head's class page and waits for every PDF (D45). */
export async function publishWithPdfs(
  page: Page,
  school: { headEmail?: string | null; classId: string; termId: string },
  count: number,
) {
  await signIn(page, school.headEmail!);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/head/reports/${school.classId}/${school.termId}`);
  await page.getByRole("button", { name: `Publish ${count} reports` }).click();
  await expect(page.getByRole("region", { name: "Report PDFs" }).getByRole("status")).toHaveText(
    `${count} of ${count} report PDFs ready.`,
    { timeout: 60_000 },
  );
}
