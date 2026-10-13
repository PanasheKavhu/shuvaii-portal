import "server-only";

import { redirect } from "next/navigation";
import { needsTwoFactor } from "@/lib/auth/two-factor";
import { loadViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/**
 * Where a signed-in person stands with two-factor sign in, for the pages
 * under /two-factor. Anyone signed out goes to sign in; anyone who does not
 * need it (teachers, hods, parents, learners) goes home and never sees it.
 */
export async function twoFactorState(): Promise<{ enrolled: boolean; passed: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const viewer = await loadViewer(supabase, user.id);
  if (!needsTwoFactor(viewer)) redirect("/");
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("Could not load two-factor settings");
  return {
    enrolled: data.totp.some((f) => f.status === "verified"),
    passed: viewer.assurance === "aal2",
  };
}
