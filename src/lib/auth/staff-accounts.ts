import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasProvedEmail } from "./account-trust";

/**
 * Staff accounts for the platform console and /admin/people (D14, D24,
 * D27): the service-role side of adding staff, shared by both.
 *
 * Every new staff role starts `invited`, and the person accepts it
 * themselves: someone new through the Auth invite email, someone who
 * already has an account on /welcome the next time they sign in. Being
 * added to a school never gives access without the person's say.
 */

export type StaffAccount = {
  email: string;
  userId: string;
  /** An existing account with a proved address: no invite email, they accept on sign in. */
  hasAccount: boolean;
};

export type FindAccountsResult =
  | { ok: true; accounts: StaffAccount[] }
  | { ok: false; unproved: string[] }
  | { ok: false; unproved?: undefined };

/**
 * Finds or creates (without email) the Auth account for each address. An
 * existing account whose address nobody proved (D27) is refused, listed
 * in `unproved`, and nothing is created.
 */
export async function findOrCreateAccounts(
  people: readonly { email: string; fullName: string; phone?: string | null }[],
): Promise<FindAccountsResult> {
  const admin = createAdminClient();
  const emails = [...new Set(people.map((p) => p.email))];
  const existing = await admin.from("profiles").select("id, email").in("email", emails);
  if (existing.error) return { ok: false };
  const idByEmail = new Map(existing.data.map((p) => [p.email!, p.id]));
  const hasAccountById = new Map<string, boolean>();
  const unproved: string[] = [];

  for (const [email, id] of idByEmail) {
    const user = await admin.auth.admin.getUserById(id);
    if (user.error) return { ok: false };
    if (user.data.user.email_confirmed_at && !hasProvedEmail(user.data.user)) unproved.push(email);
    hasAccountById.set(id, hasProvedEmail(user.data.user));
  }
  if (unproved.length) return { ok: false, unproved };

  for (const person of people) {
    if (idByEmail.has(person.email)) continue;
    const created = await admin.auth.admin.createUser({
      email: person.email,
      email_confirm: false,
      user_metadata: { full_name: person.fullName, ...(person.phone && { phone: person.phone }) },
    });
    if (created.error || !created.data.user) return { ok: false };
    idByEmail.set(person.email, created.data.user.id);
    hasAccountById.set(created.data.user.id, false);
  }

  return {
    ok: true,
    accounts: emails.map((email) => {
      const userId = idByEmail.get(email)!;
      return { email, userId, hasAccount: hasAccountById.get(userId)! };
    }),
  };
}

export type InviteEmailOutcome = "sent" | "has-account" | "too-soon" | "failed";

/** Sends (or re-sends) the Auth invite email; a fresh link stops the old one (D14). */
export async function sendInviteEmail(
  email: string,
  fullName?: string,
): Promise<InviteEmailOutcome> {
  const invited = await createAdminClient().auth.admin.inviteUserByEmail(
    email,
    fullName ? { data: { full_name: fullName } } : undefined,
  );
  if (invited.error?.code === "email_exists") return "has-account";
  if (invited.error?.code === "over_email_send_rate_limit") return "too-soon";
  if (invited.error) return "failed";
  return "sent";
}

/** What to tell an admin when an invite email could not be re-sent. */
export function resendProblem(outcome: Exclude<InviteEmailOutcome, "sent">, email: string): string {
  switch (outcome) {
    case "has-account":
      return `${email} already has an account. Ask them to sign in to accept.`;
    case "too-soon":
      return "An invite was sent moments ago. Please wait a minute and try again.";
    case "failed":
      return "Could not resend the invite. Please try again.";
  }
}

/** The message for an address refused because its account never proved it (D27). */
export function unprovedMessage(emails: readonly string[]): string {
  return `${emails.join(", ")} ${emails.length === 1 ? "belongs" : "belong"} to an account whose email address was never confirmed. Ask them to use "Forgot your password?" on the sign-in page first, then add them again.`;
}
