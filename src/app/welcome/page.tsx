import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer, landingPathFor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Where an invite link lands (after /auth/confirm signs the invitee in).
 * Only someone with a pending invite sees the form; anyone else goes home.
 * (An invitee cannot read the school yet: school RLS counts active
 * memberships only, so the page does not name it.)
 */
export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", viewer.userId)
    .eq("status", "invited");
  if (!data?.length) redirect(await landingPathFor(viewer));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Welcome to SP Portal</h1>
          </CardTitle>
          <CardDescription>
            Choose a password to finish setting up your account. You will use it with your email
            address to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WelcomeForm />
        </CardContent>
      </Card>
    </main>
  );
}
