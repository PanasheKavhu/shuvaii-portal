"use server";

import { redirect } from "next/navigation";
import { EMAIL_UNVERIFIED, matchesEmailOnFile } from "@/lib/auth/account-trust";
import { hashInviteCode, normalizeInviteCode } from "@/lib/auth/invite-code";
import { parseParentSignUp } from "@/lib/auth/parent-sign-up";
import { rememberSchool } from "@/lib/auth/school-cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "../(app)/platform/form-state";

/**
 * US-1.3: a parent claims the one-time code the school gave them, either
 * with a new account (name, email, password) or with the account they are
 * signed in with. redeem_parent_invite() links the account to their
 * guardian record, and so to all their children, in one step (D25).
 */

const TRY_AGAIN = "Something went wrong. Please try again.";

/** What to tell the parent when the database refuses a code. */
function redeemError(message: string | undefined): string {
  switch (message) {
    case "invite_used":
      return "This code was already used. If you set up the account, sign in with your email and password.";
    case "invite_expired":
      return "This code has expired. Ask the school office for a new one.";
    case "invite_unknown":
      return "We could not find that code. Check it and try again.";
    case "guardian_taken":
      return "This parent record already has an account. Ask the school office for help.";
    default:
      return TRY_AGAIN;
  }
}

async function redeem(codeHash: string): Promise<{ schoolId: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_parent_invite", { p_code_hash: codeHash });
  if (error || !data) return { error: redeemError(error?.message) };
  return { schoolId: data };
}

/** The new-account form's result; it echoes the name and email so they survive a rejection. */
export type NewParentState = FormState & { values: { fullName: string; email: string } | null };

/** New parent: makes their account, signs them in and claims the code. */
export async function claimWithNewAccount(
  rawCode: string,
  _prev: NewParentState,
  formData: FormData,
): Promise<NewParentState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values = { fullName: text("fullName"), email: text("email") };
  const fail = (message: string | null, errors: FormState["errors"] = {}): NewParentState => ({
    status: "error",
    message,
    errors,
    values,
  });

  const code = normalizeInviteCode(rawCode);
  if (!code) return fail(redeemError("invite_unknown"));
  const parsed = parseParentSignUp({
    fullName: values.fullName,
    email: values.email,
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.ok) return fail(null, parsed.errors);
  const { fullName, email, password } = parsed.value;

  const supabase = await createClient();
  const preview = await supabase.rpc("parent_invite_preview", {
    p_code_hash: hashInviteCode(code),
  });
  const invite = preview.data?.[0];
  if (preview.error || !invite?.status) return fail(TRY_AGAIN);
  if (invite.status !== "valid") return fail(redeemError(`invite_${invite.status}`));

  // The code proves the school knows this parent, so they can sign in with
  // the address straight away (D25). Only the address the school has on
  // file counts as proved; any other is flagged so it can never become a
  // staff account until a password reset proves the inbox (D27).
  const created = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    ...(!matchesEmailOnFile(email, invite.guardian_email) && {
      app_metadata: { [EMAIL_UNVERIFIED]: true },
    }),
  });
  if (created.error?.code === "email_exists") {
    return fail(null, {
      email:
        "This email already has an account. Sign in with it first, then open your code again to add your children.",
    });
  }
  if (created.error?.code === "weak_password") {
    return fail(null, { password: "Choose a stronger password." });
  }
  if (created.error) return fail(TRY_AGAIN);

  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error) return fail(TRY_AGAIN);

  const result = await redeem(hashInviteCode(code));
  if ("error" in result) return fail(result.error);
  await rememberSchool(result.schoolId);
  redirect("/children");
}

/** Signed-in person (a teacher who is also a parent, or a parent at another school). */
export async function claimWithThisAccount(rawCode: string): Promise<FormState> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { status: "error", message: redeemError("invite_unknown"), errors: {} };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/join?code=${code}`);

  const result = await redeem(hashInviteCode(code));
  if ("error" in result) return { status: "error", message: result.error, errors: {} };
  await rememberSchool(result.schoolId);
  redirect("/children");
}
