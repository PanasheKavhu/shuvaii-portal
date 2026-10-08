import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIN_MUST_CHANGE, generatePin, learnerAuthEmail, pinPassword } from "./learner-pin";

/**
 * Learner accounts (US-1.2, D26): the service-role side of learner sign in.
 * A learner's Auth account is made by the server, names its learner in
 * app_metadata (which only the service role can write) and has a password
 * derived from the PIN with LEARNER_PIN_SECRET. Nothing else reads that secret.
 */

function pinSecret(): string {
  const secret = process.env.LEARNER_PIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("LEARNER_PIN_SECRET is not set (at least 32 characters)");
  }
  return secret;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** The Auth account behind a learner record, if it is one the server made for them. */
async function learnerAccount(admin: AdminClient, learnerId: string, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || data.user.app_metadata?.learner_id !== learnerId) return null;
  return data.user;
}

export type LearnerForPin = {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
};

/**
 * Gives a learner a new random PIN, making their account first if they have
 * none. They must choose their own PIN at their next sign in. Returns the
 * PIN (shown once to the admin) and the account id for link_learner_login(),
 * or null if the account could not be made or is not this learner's.
 */
export async function issueLearnerPin(
  learner: LearnerForPin,
): Promise<{ pin: string; userId: string } | null> {
  const admin = createAdminClient();
  const pin = generatePin(randomInt);

  let userId = learner.userId;
  if (!userId) {
    // An account made by an earlier attempt that failed before linking.
    const earlier = await admin
      .from("profiles")
      .select("id")
      .eq("email", learnerAuthEmail(learner.id))
      .maybeSingle();
    if (earlier.error) return null;
    userId = earlier.data?.id ?? null;
  }

  if (!userId) {
    const id = randomUUID();
    const created = await admin.auth.admin.createUser({
      id,
      email: learnerAuthEmail(learner.id),
      email_confirm: true,
      password: pinPassword(pinSecret(), id, pin),
      user_metadata: { full_name: learner.fullName },
      app_metadata: {
        learner_id: learner.id,
        school_id: learner.schoolId,
        [PIN_MUST_CHANGE]: true,
      },
    });
    return created.error ? null : { pin, userId: id };
  }

  const account = await learnerAccount(admin, learner.id, userId);
  if (!account) return null;
  const updated = await admin.auth.admin.updateUserById(userId, {
    password: pinPassword(pinSecret(), userId, pin),
    app_metadata: { ...account.app_metadata, [PIN_MUST_CHANGE]: true },
  });
  return updated.error ? null : { pin, userId };
}

export type LearnerLogin = { email: string; password: string };

/**
 * What to pass to Supabase Auth for a learner number and PIN, or null when
 * the school has no such learner with an account, or the learner has left
 * (D28). The caller treats null exactly like a wrong PIN, so the reply
 * never says which learners exist.
 */
export async function learnerLogin(
  schoolId: string,
  learnerNumber: string,
  pin: string,
): Promise<LearnerLogin | null | "unavailable"> {
  const admin = createAdminClient();
  const escaped = learnerNumber.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error } = await admin
    .from("learners")
    .select("id, user_id, status")
    .eq("school_id", schoolId)
    .ilike("learner_number", escaped)
    .limit(2);
  if (error) return "unavailable";
  const learner = data.length === 1 ? data[0] : null;
  if (!learner?.user_id || learner.status !== "active") return null;

  const account = await learnerAccount(admin, learner.id, learner.user_id);
  if (!account?.email) return null;
  return { email: account.email, password: pinPassword(pinSecret(), account.id, pin) };
}

/**
 * Sets the PIN the learner chose and clears the must-change flag. The
 * caller has checked that `userId` is the signed-in learner. Returns the
 * new login, so the caller can start a session without the flag.
 */
export async function chooseLearnerPin(userId: string, pin: string): Promise<LearnerLogin | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || typeof data.user.app_metadata?.learner_id !== "string" || !data.user.email) {
    return null;
  }
  const password = pinPassword(pinSecret(), userId, pin);
  const updated = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { ...data.user.app_metadata, [PIN_MUST_CHANGE]: false },
  });
  return updated.error ? null : { email: data.user.email, password };
}
