import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signedInWithPassword } from "@/lib/auth/account-trust";
import { roleLabel } from "@/lib/auth/roles";
import { getViewer, landingPathFor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DeclineForm, WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Where a staff invite is accepted (D14, D27). Someone who came from an
 * invite link (after /auth/confirm signed them in) chooses a password;
 * someone who already had an account and signed in as usual just accepts
 * or declines. Anyone with nothing waiting goes home. An invitee cannot
 * read the school yet, so my_pending_invites() names it.
 */
export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  const supabase = await createClient();
  const [{ data: pending }, { data: claims }] = await Promise.all([
    supabase.rpc("my_pending_invites"),
    supabase.auth.getClaims(),
  ]);
  if (!pending?.length) redirect(await landingPathFor(viewer));
  const needsPassword = !signedInWithPassword(claims?.claims.amr);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Welcome to SP Portal</h1>
          </CardTitle>
          <CardDescription>
            {needsPassword
              ? "Choose a password to finish setting up your account. You will use it with your email address to sign in."
              : "You have been added to a school. Accept to get access."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ul aria-label="Waiting for you" className="flex flex-col gap-1 text-sm">
            {pending.map((p) => (
              <li key={`${p.school_name}-${p.role}`}>
                <span className="font-medium">{p.school_name}</span>: {roleLabel(p.role)}
              </li>
            ))}
          </ul>
          <WelcomeForm needsPassword={needsPassword} />
          {!needsPassword && <DeclineForm />}
        </CardContent>
      </Card>
    </main>
  );
}
