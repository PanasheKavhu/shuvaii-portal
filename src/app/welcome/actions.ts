"use server";

import { redirect } from "next/navigation";
import { signedInWithPassword } from "@/lib/auth/account-trust";
import { getViewer, landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { parseNewPassword } from "@/lib/auth/new-password";
import { createClient } from "@/lib/supabase/server";

export type WelcomeState = { error: string | null };

/**
 * Accepts the viewer's staff invites (D14, D27). Someone who came from an
 * invite link sets their password first; someone who signed in with the
 * account they already had just accepts. Then home.
 */
export async function acceptInvite(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  const supabase = await createClient();
  const [invited, { data: claims }] = await Promise.all([
    supabase.from("memberships").select("id").eq("user_id", viewer.userId).eq("status", "invited"),
    supabase.auth.getClaims(),
  ]);
  if (invited.error) return { error: "Something went wrong. Please try again." };
  if (invited.data.length === 0) redirect(await landingPathFor(viewer));

  if (!signedInWithPassword(claims?.claims.amr)) {
    const parsed = parseNewPassword({
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.ok) return { error: parsed.error };

    const updated = await supabase.auth.updateUser({ password: parsed.value });
    if (updated.error) {
      return {
        error:
          updated.error.code === "weak_password"
            ? "Choose a stronger password."
            : "Could not set your password. Please try again.",
      };
    }
  }

  const accepted = await supabase.rpc("accept_my_invites");
  if (accepted.error) return { error: "Something went wrong. Please try again." };

  redirect(await landingPathFor(await loadViewer(supabase, viewer.userId)));
}

/** Turns the invites down: those memberships are disabled (D27). */
export async function declineInvite(): Promise<WelcomeState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const supabase = await createClient();
  const declined = await supabase.rpc("decline_my_invites");
  if (declined.error) return { error: "Something went wrong. Please try again." };
  redirect(await landingPathFor(await loadViewer(supabase, viewer.userId)));
}
