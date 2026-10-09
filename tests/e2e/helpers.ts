import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

// Seed data (seed/*.csv); the password is the published local demo password
// from scripts/seed.mjs.
export const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "sp-portal-demo-2026";
export const PLATFORM_ADMIN = "platform@demo.spportal.test";
export const MSASA_ADMIN = "gtembo@msasa.demo.spportal.test";
export const MSASA_TEACHER = "rchik@msasa.demo.spportal.test";

export const MSASA = {
  id: "9341cf1e-f77b-5e4a-abbe-6a72f8c4a2fa",
  name: "Msasa Demo High School",
  primary: "#0b5fa5",
};
export const KUDZAI = {
  id: "f2856ae5-c561-5f69-8db8-0495481bb2b0",
  name: "Kudzai Demo Primary School",
  slug: "kudzai-demo",
  motto: "Learning Together",
  primary: "#1b7f5c",
};

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A CSS custom property's computed value on <html>. */
export const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Local Supabase's email catcher (supabase/config.toml [local_smtp]). */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Waits for the invite email to `to` and returns the token hash from its link. */
export async function inviteTokenFor(to: string): Promise<string> {
  return (await inviteTokensFor(to, 1))[0]!;
}

/**
 * Waits until `count` invite emails to `to` have arrived and returns the
 * token hash from each link, newest first.
 */
export async function inviteTokensFor(to: string, count: number): Promise<string[]> {
  let ids: string[] = [];
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        ids = messages.map((m) => m.ID);
        return ids.length >= count;
      },
      { message: `${count} invite email(s) to ${to}`, timeout: 20_000 },
    )
    .toBe(true);

  return Promise.all(
    ids.map(async (id) => {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const match = /token_hash=([^&"'\s]+)/.exec(HTML);
      if (!match) throw new Error("Invite email has no token_hash link");
      return match[1]!;
    }),
  );
}

/**
 * Console events in a school's audit log, read as that school's admin
 * through RLS (D18), oldest first. Uses the public URL and anon key from
 * .env.local, as the app does.
 */
export async function auditEventsAs(
  email: string,
  password: string,
  schoolId: string,
): Promise<string[]> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("Could not sign in to read the audit log");
  const { data, error } = await supabase
    .from("audit_log")
    .select("event")
    .eq("school_id", schoolId)
    .eq("action", "event")
    .order("id");
  if (error) throw new Error("Could not read the audit log");
  return data.map((row) => row.event!);
}

/**
 * A confirmed test account with the demo password. Public sign-up is off
 * (D27), so tests make accounts with the local service-role key, as
 * scripts/seed.mjs does; this never runs in the app.
 */
export async function createTestAccount(email: string, fullName?: string): Promise<string> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    ...(fullName && { user_metadata: { full_name: fullName } }),
  });
  if (error || !data.user) throw new Error("Could not create a test user");
  return data.user.id;
}

/** A fresh account with no school, so a test can change its password without touching the seed users. */
export async function createLoneUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.spportal.test`;
  await createTestAccount(email);
  return email;
}

/** Waits for the password-reset email to `to`; returns its link's token hash and its code. */
export async function resetEmailFor(to: string): Promise<{ tokenHash: string; code: string }> {
  let id = "";
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"Reset"`)}`,
        );
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        id = messages[0]?.ID ?? "";
        return id !== "";
      },
      { message: `reset email to ${to}`, timeout: 20_000 },
    )
    .toBe(true);

  const message = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const { HTML } = (await message.json()) as { HTML: string };
  const tokenHash = /token_hash=([^&"'\s]+)/.exec(HTML)?.[1];
  const code = /<strong>(\d{6})<\/strong>/.exec(HTML)?.[1];
  if (!tokenHash || !code) throw new Error("Reset email has no link or code");
  return { tokenHash, code };
}

/**
 * A brand-new school with an active school admin, a teacher and a head of
 * department, made through the API as the platform admin (who may create
 * schools and memberships, D3). Returns the admin's email and the staff names.
 * With `head`, also an active head (headEmail and headName).
 */
export async function createEmptySchool(
  prefix: string,
  options: { head?: boolean } = {},
): Promise<{
  schoolId: string;
  adminEmail: string;
  adminName: string;
  teacherEmail: string;
  teacherName: string;
  hodEmail: string;
  hodName: string;
  headEmail: string | null;
  headName: string | null;
}> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const client = () =>
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function newUser(role: string, fullName: string) {
    const email = `${prefix}-${role}-${stamp}@demo.spportal.test`;
    return { id: await createTestAccount(email, fullName), email };
  }

  const platform = client();
  const signedIn = await platform.auth.signInWithPassword({
    email: PLATFORM_ADMIN,
    password: PASSWORD,
  });
  if (signedIn.error) throw new Error("Could not sign in as the platform admin");
  const { data: school, error } = await platform
    .from("schools")
    .insert({ name: `Setup School ${stamp}`, slug: `setup-${stamp}`, stage: "secondary" })
    .select("id")
    .single();
  if (error) throw new Error("Could not create a test school");

  const teacherName = `Tendai Teacher ${stamp}`;
  const hodName = `Hazel Hod ${stamp}`;
  const adminName = `Ada Admin ${stamp}`;
  const admin = await newUser("admin", adminName);
  const teacher = await newUser("teacher", teacherName);
  const hod = await newUser("hod", hodName);
  const headName = options.head ? `Hope Head ${stamp}` : null;
  const head = headName ? await newUser("head", headName) : null;
  const { error: memberError } = await platform.from("memberships").insert([
    { school_id: school.id, user_id: admin.id, role: "school_admin", status: "active" },
    { school_id: school.id, user_id: teacher.id, role: "teacher", status: "active" },
    { school_id: school.id, user_id: hod.id, role: "hod", status: "active" },
    ...(head
      ? [
          {
            school_id: school.id,
            user_id: head.id,
            role: "head" as const,
            status: "active" as const,
          },
        ]
      : []),
  ]);
  if (memberError) throw new Error("Could not add the test school's staff");
  return {
    schoolId: school.id,
    adminEmail: admin.email,
    adminName,
    teacherEmail: teacher.email,
    teacherName,
    hodEmail: hod.email,
    hodName,
    headEmail: head?.email ?? null,
    headName,
  };
}

/** A client signed in as `email` with the demo password, through RLS. */
export async function signedInClient(email: string) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error("Could not sign in a test client");
  return supabase;
}

/**
 * A new school (createEmptySchool) with one class for marks entry, made
 * through the API as its school admin: the O-level bands, a current year
 * with one open term around today and no deadline, class "4 Blue" with
 * Mathematics taught by the teacher and English by the hod, and `learners`
 * learners who all take both. With `marks`, the usual three assessments
 * for Mathematics and a mark for every learner in each.
 */
export async function createMarksClass(
  prefix: string,
  options: { learners?: number; marks?: boolean; head?: boolean } = {},
) {
  const school = await createEmptySchool(prefix, { head: options.head });
  const db = await signedInClient(school.adminEmail);
  const must = <T>(result: { data: T; error: unknown }, what: string): NonNullable<T> => {
    if (result.error || result.data == null) throw new Error(`Could not create ${what}`);
    return result.data;
  };
  const id = school.schoolId;
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const scale = must(
    await db
      .from("grading_scales")
      .insert({ school_id: id, name: "O-Level", stage: "o_level" })
      .select("id")
      .single(),
    "a scale",
  );
  must(
    await db
      .from("grading_bands")
      .insert(
        [
          ["A", 70, 100],
          ["B", 60, 69],
          ["C", 50, 59],
          ["D", 45, 49],
          ["E", 40, 44],
          ["U", 0, 39],
        ].map(([grade, min, max], i) => ({
          school_id: id,
          scale_id: scale.id,
          grade: grade as string,
          min_mark: min as number,
          max_mark: max as number,
          sort_order: i + 1,
        })),
      )
      .select("id"),
    "bands",
  );
  const level = must(
    await db
      .from("grade_levels")
      .insert({ school_id: id, name: "Form 4", stage: "o_level", grading_scale_id: scale.id })
      .select("id")
      .single(),
    "a grade level",
  );
  const year = must(
    await db
      .from("academic_years")
      .insert({
        school_id: id,
        label: "This year",
        starts_on: day(-200),
        ends_on: day(200),
        is_current: true,
      })
      .select("id")
      .single(),
    "a year",
  );
  const term = must(
    await db
      .from("terms")
      .insert({
        school_id: id,
        academic_year_id: year.id,
        name: "Term Now",
        kind: "term",
        starts_on: day(-30),
        ends_on: day(60),
        status: "open",
      })
      .select("id")
      .single(),
    "a term",
  );
  const members = must(await db.rpc("school_staff", { p_school_id: id }), "the staff list");
  const teacherId = members.find((m) => m.full_name === school.teacherName)!.user_id;
  const hodId = members.find((m) => m.full_name === school.hodName)!.user_id;
  const klass = must(
    await db
      .from("classes")
      .insert({
        school_id: id,
        academic_year_id: year.id,
        grade_level_id: level.id,
        name: "4 Blue",
        class_teacher_id: teacherId,
      })
      .select("id")
      .single(),
    "a class",
  );
  const subjects = must(
    await db
      .from("subjects")
      .insert([
        {
          school_id: id,
          code: "MATH",
          name: "Mathematics",
          stage_scope: "secondary",
          sort_order: 1,
        },
        { school_id: id, code: "ENG", name: "English", stage_scope: "secondary", sort_order: 2 },
      ])
      .select("id, code"),
    "subjects",
  );
  const classSubjects = must(
    await db
      .from("class_subjects")
      .insert([
        {
          school_id: id,
          class_id: klass.id,
          subject_id: subjects.find((s) => s.code === "MATH")!.id,
          teacher_id: teacherId,
        },
        {
          school_id: id,
          class_id: klass.id,
          subject_id: subjects.find((s) => s.code === "ENG")!.id,
          teacher_id: hodId,
        },
      ])
      .select("id, teacher_id"),
    "class subjects",
  );
  const maths = classSubjects.find((cs) => cs.teacher_id === teacherId)!.id;
  const english = classSubjects.find((cs) => cs.teacher_id === hodId)!.id;

  const count = options.learners ?? 3;
  const names = ["Chipo", "Farai", "Tatenda", "Rumbi", "Kuda", "Nyasha", "Tendai", "Vimbai"];
  const learners = must(
    await db
      .from("learners")
      .insert(
        Array.from({ length: count }, (_, i) => ({
          school_id: id,
          learner_number: `M${String(i + 1).padStart(3, "0")}`,
          first_name: names[i % names.length]!,
          last_name: `Learner${String(i + 1).padStart(2, "0")}`,
        })),
      )
      .select("id, first_name, last_name, learner_number"),
    "learners",
  );
  learners.sort((a, b) => a.learner_number.localeCompare(b.learner_number));
  const enrolments = must(
    await db
      .from("enrolments")
      .insert(
        learners.map((l) => ({
          school_id: id,
          learner_id: l.id,
          class_id: klass.id,
          academic_year_id: year.id,
        })),
      )
      .select("id, learner_id"),
    "enrolments",
  );
  must(
    await db
      .from("enrolment_subjects")
      .insert(
        enrolments.flatMap((e) =>
          [maths, english].map((cs) => ({
            school_id: id,
            enrolment_id: e.id,
            class_subject_id: cs,
          })),
        ),
      )
      .select("id"),
    "subject choices",
  );

  if (options.marks) {
    const assessments = must(
      await db
        .from("assessments")
        .insert(
          [
            { name: "Test 1", type: "test" as const, max_mark: 30, weight_percent: 20 },
            { name: "Test 2", type: "test" as const, max_mark: 50, weight_percent: 20 },
            { name: "Exam", type: "exam" as const, max_mark: 100, weight_percent: 60 },
          ].map((a, i) => ({
            ...a,
            school_id: id,
            term_id: term.id,
            class_subject_id: maths,
            sort_order: i + 1,
          })),
        )
        .select("id, max_mark"),
      "assessments",
    );
    must(
      await db
        .from("marks")
        .insert(
          assessments.flatMap((a, ai) =>
            enrolments.map((e, ei) => ({
              school_id: id,
              assessment_id: a.id,
              enrolment_id: e.id,
              score: (ei * 7 + ai * 3) % (Number(a.max_mark) + 1),
              status: "present" as const,
            })),
          ),
        )
        .select("id"),
      "marks",
    );
  }

  return {
    ...school,
    termId: term.id,
    classId: klass.id,
    mathsId: maths,
    englishId: english,
    learners: learners.map((l) => ({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`,
      enrolmentId: enrolments.find((e) => e.learner_id === l.id)!.id,
    })),
  };
}

/**
 * Two new learners in Msasa with one shared guardian, made through the API
 * as Msasa's school admin (RLS allows admin writes, D23). Fresh numbers,
 * names and phone each run, since learners are never deleted.
 */
export async function createFamily(prefix: string): Promise<{
  learners: { id: string; number: string; firstName: string }[];
  guardianName: string;
  lastName: string;
}> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await supabase.auth.signInWithPassword({
    email: MSASA_ADMIN,
    password: PASSWORD,
  });
  if (signedIn.error) throw new Error("Could not sign in as Msasa's admin");

  const stamp = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
  const lastName = `Family${stamp}`;
  const { data: learners, error } = await supabase
    .from("learners")
    .insert(
      ["Rudo", "Tino"].map((firstName, i) => ({
        school_id: MSASA.id,
        learner_number: `${prefix}${stamp}${i}`.toUpperCase(),
        first_name: firstName,
        last_name: lastName,
      })),
    )
    .select("id, learner_number, first_name");
  if (error) throw new Error("Could not add test learners");

  const guardianName = `Chipo ${lastName}`;
  const { data: guardian, error: guardianError } = await supabase
    .from("guardians")
    .insert({ school_id: MSASA.id, full_name: guardianName, phone: `078${stamp}` })
    .select("id")
    .single();
  if (guardianError) throw new Error("Could not add a test guardian");
  const { error: linkError } = await supabase.from("guardian_links").insert(
    learners.map((l) => ({
      school_id: MSASA.id,
      guardian_id: guardian.id,
      learner_id: l.id,
      relationship: "mother",
      is_primary: true,
    })),
  );
  if (linkError) throw new Error("Could not link the test guardian");

  return {
    learners: learners
      .map((l) => ({ id: l.id, number: l.learner_number, firstName: l.first_name }))
      .sort((a, b) => a.number.localeCompare(b.number)),
    guardianName,
    lastName,
  };
}

/** Msasa's school admin through the API (RLS applies, D23), for checks a page cannot show. */
async function msasaAdminClient() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI).
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await supabase.auth.signInWithPassword({
    email: MSASA_ADMIN,
    password: PASSWORD,
  });
  if (signedIn.error) throw new Error("Could not sign in as Msasa's admin");
  return supabase;
}

/** How many Msasa learners have a learner number starting with `prefix`. */
export async function countLearners(prefix: string): Promise<number> {
  const supabase = await msasaAdminClient();
  const { count, error } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .eq("school_id", MSASA.id)
    .ilike("learner_number", `${prefix}%`);
  if (error || count === null) throw new Error("Could not count learners");
  return count;
}

/** Marks a Msasa learner as left (or back to active), as the learner page does. */
export async function setLearnerStatus(learnerId: string, status: "active" | "left") {
  const supabase = await msasaAdminClient();
  const { error } = await supabase.from("learners").update({ status }).eq("id", learnerId);
  if (error) throw new Error("Could not change the learner's status");
}
