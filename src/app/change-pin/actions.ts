"use server";

import { redirect } from "next/navigation";
import { chooseLearnerPin } from "@/lib/auth/learner-accounts";
import { parseNewPin } from "@/lib/auth/learner-pin";
import { landingPathFor, loadViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type ChangePinState = { error: string | null };

/**
 * US-1.2: a learner chooses their own PIN, which they must do after an
 * admin set or reset it. Other sessions are signed out.
 */
export async function changePin(
  _prev: ChangePinState,
  formData: FormData,
): Promise<ChangePinState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/learner");
  if (typeof user.app_metadata?.learner_id !== "string") redirect("/");

  const parsed = parseNewPin({ pin: formData.get("pin"), confirm: formData.get("confirm") });
  if (!parsed.ok) return { error: parsed.error };

  const login = await chooseLearnerPin(user.id, parsed.value);
  if (!login) return { error: "Could not save your PIN. Please try again." };

  // A fresh session carries the cleared flag; every older one is signed out.
  const signedIn = await supabase.auth.signInWithPassword(login);
  if (signedIn.error) redirect("/sign-in/learner");
  await supabase.auth.signOut({ scope: "others" });

  redirect(await landingPathFor(await loadViewer(supabase, user.id)));
}
