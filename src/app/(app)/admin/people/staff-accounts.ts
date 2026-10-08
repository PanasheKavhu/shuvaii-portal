import "server-only";

import { sendInviteEmail, type StaffAccount } from "@/lib/auth/staff-accounts";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite emails for /admin/people (SPEC US-3.1, US-3.3; D14, D24, D27).
 * Adding staff is three steps so the database part stays all-or-nothing:
 * 1. find or create each person's Auth account (findOrCreateAccounts, no email);
 * 2. the caller adds every membership in one transaction, `invited` unless
 *    the person already has an active role in this school;
 * 3. this sends the Auth invite to people without an account yet and
 *    records each with log_staff_invite_event(). Someone who already has an
 *    account gets no email and accepts on /welcome when they next sign in.
 *    An email that fails can be sent again with "Resend invite".
 */
export async function sendStaffInvites(
  schoolId: string,
  accounts: readonly StaffAccount[],
  fullNames: ReadonlyMap<string, string>,
): Promise<string[]> {
  const supabase = await createClient();
  const failed: string[] = [];

  for (const account of accounts) {
    if (account.hasAccount) continue;
    const membership = await supabase
      .from("memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", account.userId)
      .eq("status", "invited")
      .limit(1)
      .maybeSingle();
    if (!membership.data) continue;
    if ((await sendInviteEmail(account.email, fullNames.get(account.email))) !== "sent") {
      failed.push(account.email);
      continue;
    }
    await supabase.rpc("log_staff_invite_event", {
      p_membership_id: membership.data.id,
      p_event: "staff_invited",
    });
  }
  return failed;
}
