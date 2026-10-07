"use server";

import { redirect } from "next/navigation";
import { lockedUntil, minutesLeft } from "@/lib/auth/lockout";
import { parseResetCode, parseResetEmail } from "@/lib/auth/password-reset";
import { startResetSession } from "@/lib/auth/reset-session";
import {
  emailHash,
  lockedAfterFailure,
  recentAttempts,
  recordAttempt,
  tooManyAttempts,
} from "@/lib/auth/sign-in-attempts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ForgotState = {
  step: "email" | "code";
  email: string;
  error: string | null;
};

const UNAVAILABLE = "Password reset is unavailable right now. Please try again shortly.";

/**
 * Step 1 of US-1.7: emails a reset link and code. The reply is the same
 * whether or not the address has an account, so the form never reveals who
 * is registered (D19).
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";
  const parsed = parseResetEmail({ email: rawEmail });
  if (!parsed.ok) return { step: "email", email, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.value);
  // Auth's per-address resend limit only applies to real accounts, so it is
  // treated like success; anything else is an outage.
  if (error && error.status !== 429) return { step: "email", email, error: UNAVAILABLE };

  return { step: "code", email: parsed.value, error: null };
}

/**
 * Step 2: the code typed from the email. Wrong codes count towards the same
 * per-address lockout as wrong passwords (D8, D19), so the code cannot be
 * guessed. The emailed link needs no lockout: it carries a long token.
 */
export async function verifyResetCode(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";
  const parsed = parseResetCode({ email: rawEmail, code: formData.get("code") });
  if (!parsed.ok) return { step: "code", email, error: parsed.error };

  const hash = emailHash(parsed.value.email);
  const admin = createAdminClient();
  const now = new Date();

  const history = await recentAttempts(admin, hash, now);
  if (!history) return { step: "code", email, error: UNAVAILABLE };
  const blockedUntil = lockedUntil(history, now);
  if (blockedUntil) {
    return { step: "code", email, error: tooManyAttempts(minutesLeft(blockedUntil, now)) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    email: parsed.value.email,
    token: parsed.value.code,
  });

  // A wrong code and an expired one look the same to Auth (otp_expired).
  if (error && error.code !== "otp_expired") return { step: "code", email, error: UNAVAILABLE };

  if (error || !data.session) {
    const failedAt = new Date();
    if (!(await recordAttempt(admin, hash, false))) {
      return { step: "code", email, error: UNAVAILABLE };
    }
    const nowBlocked = lockedAfterFailure(history, failedAt);
    return {
      step: "code",
      email,
      error: nowBlocked
        ? tooManyAttempts(minutesLeft(nowBlocked, failedAt))
        : "That code is wrong or has expired. Check the latest email, or ask for a new one.",
    };
  }

  await startResetSession(supabase, data.session.access_token);
  redirect("/reset-password");
}
