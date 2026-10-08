import "server-only";

import type { StaffRole } from "@/lib/people/fields";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff accounts for /admin/people (SPEC US-3.1, US-3.3; D14, D24): the one
 * place this area uses the service-role client, and only for Auth.
 *
 * Adding staff is three steps so the database part stays all-or-nothing:
 * 1. find or create each person's Auth account (no email yet);
 * 2. the caller adds every membership in one transaction;
 * 3. invite emails go to the people whose membership is `invited`, through
 *    the same Supabase Auth invite as the console, each recorded with
 *    log_staff_invite_event(). An email that fails can be sent again with
 *    "Resend invite".
 *
 * Someone who already has a confirmed account (a teacher at another school)
 * gets an `active` membership and no email, as the console does.
 */

export type StaffAccount = {
  email: string;
  fullName: string;
  role: StaffRole;
  userId: string;
  status: "invited" | "active";
};

export async function findOrCreateAccounts(
  people: readonly { email: string; fullName: string; phone: string | null; role: StaffRole }[],
): Promise<StaffAccount[] | null> {
  const admin = createAdminClient();
  const emails = [...new Set(people.map((p) => p.email))];
  const existing = await admin.from("profiles").select("id, email").in("email", emails);
  if (existing.error) return null;
  const idByEmail = new Map(existing.data.map((p) => [p.email!, p.id]));
  const statusById = new Map<string, "invited" | "active">();

  for (const [, id] of idByEmail) {
    const user = await admin.auth.admin.getUserById(id);
    if (user.error) return null;
    statusById.set(id, user.data.user.email_confirmed_at ? "active" : "invited");
  }

  for (const person of people) {
    if (idByEmail.has(person.email)) continue;
    const created = await admin.auth.admin.createUser({
      email: person.email,
      email_confirm: false,
      user_metadata: { full_name: person.fullName, ...(person.phone && { phone: person.phone }) },
    });
    if (created.error || !created.data.user) return null;
    idByEmail.set(person.email, created.data.user.id);
    statusById.set(created.data.user.id, "invited");
  }

  return people.map((p) => {
    const userId = idByEmail.get(p.email)!;
    return {
      email: p.email,
      fullName: p.fullName,
      role: p.role,
      userId,
      status: statusById.get(userId)!,
    };
  });
}

/**
 * Sends the invite email to each invited account and records it. Returns
 * the emails that could not be sent.
 */
export async function sendStaffInvites(
  schoolId: string,
  accounts: readonly StaffAccount[],
): Promise<string[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const failed: string[] = [];
  const sent = new Set<string>();

  for (const account of accounts) {
    if (account.status !== "invited" || sent.has(account.userId)) continue;
    sent.add(account.userId);
    const invited = await admin.auth.admin.inviteUserByEmail(account.email, {
      data: { full_name: account.fullName },
    });
    if (invited.error) {
      failed.push(account.email);
      continue;
    }
    const membership = await supabase
      .from("memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", account.userId)
      .eq("status", "invited")
      .limit(1)
      .maybeSingle();
    if (membership.data) {
      await supabase.rpc("log_staff_invite_event", {
        p_membership_id: membership.data.id,
        p_event: "staff_invited",
      });
    }
  }
  return failed;
}

/** Sends a staff member's invite again (D14): a fresh link; the old one stops working. */
export async function resendStaffInvite(
  email: string,
): Promise<"sent" | "accepted" | "too-soon" | "failed"> {
  const admin = createAdminClient();
  const invited = await admin.auth.admin.inviteUserByEmail(email);
  if (invited.error?.code === "email_exists") return "accepted";
  if (invited.error?.code === "over_email_send_rate_limit") return "too-soon";
  if (invited.error) return "failed";
  return "sent";
}

/** Whether a person has set a password (accepted an invite or signed up). */
export async function hasConfirmedAccount(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const user = await admin.auth.admin.getUserById(userId);
  return Boolean(user.data.user?.email_confirmed_at);
}
