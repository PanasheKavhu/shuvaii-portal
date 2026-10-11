import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";
import { createMarksClass, signedInClient } from "./helpers";

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

/** A class whose three reports are approved and waiting to be published. */
export async function approvedClass(prefix: string) {
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
