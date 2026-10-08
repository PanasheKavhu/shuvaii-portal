"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { learnerLogin } from "@/lib/auth/learner-accounts";
import { learnerAttemptHash, mustChangePin, parseLearnerSignIn } from "@/lib/auth/learner-pin";
import { lockedUntil, minutesLeft } from "@/lib/auth/lockout";
import {
  lockedAfterFailure,
  recentAttempts,
  recordAttempt,
  tooManyAttempts,
} from "@/lib/auth/sign-in-attempts";
import { landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LearnerSignInState = { error: string | null; schoolId: string; learnerNumber: string };

const UNAVAILABLE = "Sign in is unavailable right now. Please try again shortly.";
const WRONG = "Learner number or PIN is incorrect.";

/**
 * Learner sign in with learner number and PIN (US-1.2, D26). The same
 * lockout as staff (US-1.1, D8), counted per school and learner number:
 * unknown numbers and learners without an account count as wrong PINs, so
 * the reply never says who exists. A learner whose PIN an admin has just
 * set chooses their own before anything else.
 */
export async function signInLearner(
  _prev: LearnerSignInState,
  formData: FormData,
): Promise<LearnerSignInState> {
  const rawSchool = formData.get("schoolId");
  const rawNumber = formData.get("learnerNumber");
  const echo = {
    schoolId: typeof rawSchool === "string" ? rawSchool : "",
    learnerNumber: typeof rawNumber === "string" ? rawNumber : "",
  };
  const parsed = parseLearnerSignIn({
    schoolId: rawSchool,
    learnerNumber: rawNumber,
    pin: formData.get("pin"),
  });
  if (!parsed.ok) return { error: parsed.error, ...echo };
  const { schoolId, learnerNumber, pin } = parsed.value;

  const hash = learnerAttemptHash(schoolId, learnerNumber);
  const admin = createAdminClient();
  const now = new Date();

  const history = await recentAttempts(admin, hash, now);
  if (!history) return { error: UNAVAILABLE, ...echo };
  const blockedUntil = lockedUntil(history, now);
  if (blockedUntil) return { error: tooManyAttempts(minutesLeft(blockedUntil, now)), ...echo };

  const login = await learnerLogin(schoolId, learnerNumber, pin);
  if (login === "unavailable") return { error: UNAVAILABLE, ...echo };

  const supabase = await createClient();
  const result = login ? await supabase.auth.signInWithPassword(login) : null;
  // Only wrong PINs count towards the lockout; outages and Auth's own rate
  // limit do not.
  if (result?.error && result.error.code !== "invalid_credentials") {
    return { error: UNAVAILABLE, ...echo };
  }
  const user = result?.data.user ?? null;

  const recorded = await recordAttempt(admin, hash, user !== null);
  if (!recorded && !user) return { error: UNAVAILABLE, ...echo };

  if (!user) {
    const failedAt = new Date();
    const nowBlocked = lockedAfterFailure(history, failedAt);
    return {
      error: nowBlocked ? tooManyAttempts(minutesLeft(nowBlocked, failedAt)) : WRONG,
      ...echo,
    };
  }

  (await cookies()).delete(SCHOOL_COOKIE);
  if (mustChangePin(user.app_metadata)) redirect("/change-pin");
  const viewer = await loadViewer(supabase, user.id);
  redirect(viewer.schools.length > 1 ? "/select-school" : await landingPathFor(viewer));
}
