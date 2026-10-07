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
