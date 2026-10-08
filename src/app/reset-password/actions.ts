"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EMAIL_UNVERIFIED } from "@/lib/auth/account-trust";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { parseNewPassword } from "@/lib/auth/new-password";
import { endResetSession, hasResetSession } from "@/lib/auth/reset-session";
import { emailHash, recordAttempt } from "@/lib/auth/sign-in-attempts";
import { landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error: string | null };

/**
 * Step 3 of US-1.7: sets the new password in the session the reset link or
 * code opened, signs out every other session, clears the lockout and sends
 * the person on as after a normal sign in.
 */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasResetSession(supabase))) redirect("/forgot-password");

  const parsed = parseNewPassword({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const updated = await supabase.auth.updateUser({ password: parsed.value });
  if (updated.error) {
    return {
      error:
        updated.error.code === "weak_password"
          ? "Choose a stronger password."
          : updated.error.code === "same_password"
            ? "Choose a password different from your old one."
            : "Could not set your password. Please try again.",
    };
  }

  // Anyone who knew the old password is signed out everywhere else.
  await supabase.auth.signOut({ scope: "others" });
  await endResetSession();
  const admin = createAdminClient();
  if (user.email) await recordAttempt(admin, emailHash(user.email), true);
  // The reset link or code reached this inbox, so the address is proved (D27).
  if (user.app_metadata?.[EMAIL_UNVERIFIED] === true) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { [EMAIL_UNVERIFIED]: null } });
  }

  (await cookies()).delete(SCHOOL_COOKIE);
  const viewer = await loadViewer(supabase, user.id);
  redirect(viewer.schools.length > 1 ? "/select-school" : await landingPathFor(viewer));
}
