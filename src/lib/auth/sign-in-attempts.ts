import "server-only";

import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { LOOKBACK_MS, lockedUntil, type SignInAttempt } from "./lockout";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The `sign_in_attempts` table (D8): keyed by a hash of the normalised email,
 * read and written only with the service-role client. Used by password sign
 * in and by reset codes, which count against the same lockout (D19).
 */
export function emailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

/** Recent attempts for the lockout rule, or null if they could not be read. */
export async function recentAttempts(
  admin: AdminClient,
  hash: string,
  now: Date,
): Promise<SignInAttempt[] | null> {
  const { data, error } = await admin
    .from("sign_in_attempts")
    .select("succeeded, created_at")
    .eq("email_hash", hash)
    .gte("created_at", new Date(now.getTime() - LOOKBACK_MS).toISOString());
  if (error) return null;
  return data.map((a) => ({ at: new Date(a.created_at), succeeded: a.succeeded }));
}

/** Records an attempt; returns false if it could not be written. */
export async function recordAttempt(
  admin: AdminClient,
  hash: string,
  succeeded: boolean,
): Promise<boolean> {
  const { error } = await admin.from("sign_in_attempts").insert({ email_hash: hash, succeeded });
  return !error;
}

/** When the block that this new failure causes ends, or null if it causes none. */
export function lockedAfterFailure(history: readonly SignInAttempt[], failedAt: Date): Date | null {
  return lockedUntil([...history, { at: failedAt, succeeded: false }], failedAt);
}

export function tooManyAttempts(minutes: number): string {
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
