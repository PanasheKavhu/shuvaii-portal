import { createClient } from "@supabase/supabase-js";
import { readFileSync, rmSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types";
import { apiSignIn } from "./helpers";
import { TOTP_DIR } from "./totp";

/**
 * Before the e2e run: gives every seed super admin, school admin and head a
 * fresh authenticator app (D54) whose setup key the tests know, so their
 * sign ins can pass the second step. Their old factors, from an earlier run
 * or a person trying the app locally, are removed first.
 */
export default async function globalSetup() {
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
  rmSync(TOTP_DIR, { recursive: true, force: true });

  const csv = (name: string) =>
    readFileSync(`seed/${name}.csv`, "utf8")
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split(","));
  const emails = new Map(csv("profiles").map(([id, , email]) => [id!, email!]));
  const ids = new Set([
    ...csv("platform_admins").map(([id]) => id!),
    ...csv("memberships")
      .filter(
        ([, , , role, status]) =>
          (role === "school_admin" || role === "head") && status === "active",
      )
      .map(([, , userId]) => userId!),
  ]);

  for (const id of ids) {
    const email = emails.get(id);
    if (!email) continue;
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
    if (error) throw new Error(`Could not list ${email}'s factors`);
    for (const factor of data.factors) {
      await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
    }
    await apiSignIn(email);
  }
}
