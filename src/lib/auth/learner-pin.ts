/**
 * Learner sign in with learner number and PIN (US-1.2, Q15, D26). Pure
 * apart from the random source and secret the caller passes in, so it is
 * unit tested.
 *
 * A learner's Supabase Auth account has a made-up address that never
 * receives mail, and its password is an HMAC of the PIN keyed by a server
 * secret. Only the server can turn a PIN into that password, so nobody can
 * guess PINs against Supabase Auth directly and skip the lockout.
 */
import { createHash, createHmac } from "node:crypto";
import { learnerNumberKey, validLearnerNumber } from "@/lib/people/learner-import";
import { isUuid } from "@/lib/setup/structure";

export const PIN_LENGTH = 6;

export type Parse<T> = { ok: true; value: T } | { ok: false; error: string };

export type LearnerSignIn = { schoolId: string; learnerNumber: string; pin: string };

/** Validates the learner sign-in form at the server-action boundary. */
export function parseLearnerSignIn(form: {
  schoolId: unknown;
  learnerNumber: unknown;
  pin: unknown;
}): Parse<LearnerSignIn> {
  const schoolId = typeof form.schoolId === "string" ? form.schoolId : "";
  const learnerNumber =
    typeof form.learnerNumber === "string" ? learnerNumberKey(form.learnerNumber) : "";
  const pin = typeof form.pin === "string" ? form.pin.replace(/\s+/g, "") : "";

  if (!isUuid(schoolId)) return { ok: false, error: "Choose your school." };
  if (!learnerNumber || !pin) return { ok: false, error: "Enter your learner number and PIN." };
  if (!validLearnerNumber(learnerNumber) || !/^\d+$/.test(pin) || pin.length !== PIN_LENGTH) {
    return { ok: false, error: "Learner number or PIN is incorrect." };
  }
  return { ok: true, value: { schoolId, learnerNumber, pin } };
}

/** PINs too easy to guess: one digit repeated, or a run up or down. */
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((d, i) => (d - digits[i] + 10) % 10));
  return steps.size === 1 && [0, 1, 9].includes([...steps][0]);
}

/** A learner's new PIN, typed twice. */
export function parseNewPin(form: { pin: unknown; confirm: unknown }): Parse<string> {
  const pin = typeof form.pin === "string" ? form.pin.replace(/\s+/g, "") : "";
  const confirm = typeof form.confirm === "string" ? form.confirm.replace(/\s+/g, "") : "";
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return { ok: false, error: `Use exactly ${PIN_LENGTH} digits.` };
  }
  if (isWeakPin(pin)) {
    return {
      ok: false,
      error: "That PIN is too easy to guess. Avoid repeats and runs like 123456.",
    };
  }
  if (pin !== confirm) return { ok: false, error: "The two PINs do not match." };
  return { ok: true, value: pin };
}

/** A new random PIN an admin hands to a learner; never a weak one. */
export function generatePin(randomInt: (max: number) => number): string {
  for (;;) {
    let pin = "";
    for (let i = 0; i < PIN_LENGTH; i++) pin += String(randomInt(10));
    if (!isWeakPin(pin)) return pin;
  }
}

/**
 * The key a learner's sign-in attempts are counted under (D8, D26): the
 * same hashed column as staff emails, prefixed so the two never collide.
 */
export function learnerAttemptHash(schoolId: string, learnerNumber: string): string {
  return createHash("sha256")
    .update(`learner:${schoolId}:${learnerNumberKey(learnerNumber)}`)
    .digest("hex");
}

/** The made-up Auth address of a learner's account; `.invalid` never receives mail. */
export function learnerAuthEmail(learnerId: string): string {
  return `${learnerId}@learners.sp-portal.invalid`;
}

/** The Auth password for a learner's PIN (see the module comment). */
export function pinPassword(secret: string, userId: string, pin: string): string {
  return createHmac("sha256", secret).update(`${userId}:${pin}`).digest("base64url");
}

/** Auth app_metadata key set while the learner must choose a new PIN. */
export const PIN_MUST_CHANGE = "pin_must_change";

/** Whether a user's app_metadata says they must change their PIN first. */
export function mustChangePin(appMetadata: unknown): boolean {
  return (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    (appMetadata as Record<string, unknown>)[PIN_MUST_CHANGE] === true
  );
}
