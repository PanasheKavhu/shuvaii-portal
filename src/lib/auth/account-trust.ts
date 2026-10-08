/**
 * Whose email an account has proved (D27). Pure: the server code that adds
 * staff and parents calls these.
 *
 * Every account is made by the server (public sign-up is off). A staff
 * invite or a password reset proves the person reads that inbox. A parent
 * who claims a code with an address other than the one the school has on
 * file has proved nothing about it, so that account carries
 * `email_unverified` in its app_metadata (writable only with the service
 * role) until a password reset clears it. An account like that is never
 * given a staff role, so nobody can register a teacher's address first and
 * later sign in as that teacher.
 */
import { normalizeEmail } from "./sign-in-input";

/** app_metadata key set on accounts whose address nobody has proved. */
export const EMAIL_UNVERIFIED = "email_unverified";

type AccountLike = {
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

/** The account's address was proved: confirmed, and not flagged as unproved. */
export function hasProvedEmail(user: AccountLike): boolean {
  return Boolean(user.email_confirmed_at) && user.app_metadata?.[EMAIL_UNVERIFIED] !== true;
}

/** Whether the email a parent typed is the one the school has for them. */
export function matchesEmailOnFile(typed: string, onFile: string | null | undefined): boolean {
  if (!onFile) return false;
  return normalizeEmail(typed) === normalizeEmail(onFile);
}

/**
 * Whether this session began with the account's password. The welcome page
 * asks for a new password only when it did not: an invite link (Auth
 * records it as "otp") opens a new account that has none yet. Someone who
 * signed in with their password just accepts.
 */
export function signedInWithPassword(amr: unknown): boolean {
  return Array.isArray(amr) && amr.some((entry) => entry?.method === "password");
}
