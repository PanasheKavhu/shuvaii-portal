"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { lockedUntil, minutesLeft } from "@/lib/auth/lockout";
import { parseSignIn } from "@/lib/auth/sign-in-input";
import {
  emailHash,
  lockedAfterFailure,
  recentAttempts,
  recordAttempt,
  tooManyAttempts,
} from "@/lib/auth/sign-in-attempts";
import { landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

const UNAVAILABLE = "Sign in is unavailable right now. Please try again shortly.";

/**
 * Staff sign in (US-1.1). Checks the per-account lockout before asking
 * Supabase Auth, records the outcome, then sends the user to the school
 * picker or their role's home page.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const rawEmail = formData.get("email");
  const parsed = parseSignIn({ email: rawEmail, password: formData.get("password") });
  const email = typeof rawEmail === "string" ? rawEmail : "";
  if (!parsed.ok) return { error: parsed.error, email };

  const hash = emailHash(parsed.value.email);
  const admin = createAdminClient();
  const now = new Date();

  const history = await recentAttempts(admin, hash, now);
  if (!history) return { error: UNAVAILABLE, email };
  const blockedUntil = lockedUntil(history, now);
  if (blockedUntil) {
    return { error: tooManyAttempts(minutesLeft(blockedUntil, now)), email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.value);

  // Only wrong credentials count towards the lockout; outages and Auth's own
  // rate limit do not.
  if (error && error.code !== "invalid_credentials") return { error: UNAVAILABLE, email };

  const recorded = await recordAttempt(admin, hash, !error);
  if (!recorded && error) return { error: UNAVAILABLE, email };

  if (error) {
    // Say so straight away when this failure is the one that locks the account.
    const failedAt = new Date();
    const nowBlocked = lockedAfterFailure(history, failedAt);
    if (nowBlocked) return { error: tooManyAttempts(minutesLeft(nowBlocked, failedAt)), email };
    return { error: "Email or password is incorrect.", email };
  }

  // A multi-school user chooses their school afresh at every sign in (US-1.1).
  (await cookies()).delete(SCHOOL_COOKIE);
  const viewer = await loadViewer(supabase, data.user.id);
  redirect(viewer.schools.length > 1 ? "/select-school" : await landingPathFor(viewer));
}
