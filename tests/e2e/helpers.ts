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
 */
export async function createEmptySchool(prefix: string): Promise<{
  schoolId: string;
  adminEmail: string;
  teacherEmail: string;
  teacherName: string;
  hodName: string;
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
  const admin = await newUser("admin", `Ada Admin ${stamp}`);
  const teacher = await newUser("teacher", teacherName);
  const hod = await newUser("hod", hodName);
  const { error: memberError } = await platform.from("memberships").insert([
    { school_id: school.id, user_id: admin.id, role: "school_admin", status: "active" },
    { school_id: school.id, user_id: teacher.id, role: "teacher", status: "active" },
    { school_id: school.id, user_id: hod.id, role: "hod", status: "active" },
  ]);
  if (memberError) throw new Error("Could not add the test school's staff");
  return {
    schoolId: school.id,
    adminEmail: admin.email,
    teacherEmail: teacher.email,
    teacherName,
    hodName,
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
