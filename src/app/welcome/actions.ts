"use server";

import { redirect } from "next/navigation";
import { getViewer, landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { parseNewPassword } from "@/lib/auth/new-password";
import { createClient } from "@/lib/supabase/server";

export type WelcomeState = { error: string | null };

/**
 * Finishes an invite (D14): sets the invitee's password, turns their
 * invited memberships into active ones, then sends them to their home page.
 */
export async function acceptInvite(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  const parsed = parseNewPassword({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const invited = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", viewer.userId)
    .eq("status", "invited");
  if (invited.error) return { error: "Something went wrong. Please try again." };
  if (invited.data.length === 0) redirect(await landingPathFor(viewer));

  const updated = await supabase.auth.updateUser({ password: parsed.value });
  if (updated.error) {
    return {
      error:
        updated.error.code === "weak_password"
          ? "Choose a stronger password."
          : "Could not set your password. Please try again.",
    };
  }

  const accepted = await supabase.rpc("accept_my_invites");
  if (accepted.error) return { error: "Something went wrong. Please try again." };

  redirect(await landingPathFor(await loadViewer(supabase, viewer.userId)));
}
