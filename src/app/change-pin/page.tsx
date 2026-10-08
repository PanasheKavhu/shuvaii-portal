import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIN_LENGTH, mustChangePin } from "@/lib/auth/learner-pin";
import { createClient } from "@/lib/supabase/server";
import { ChangePinForm } from "./change-pin-form";

export const metadata: Metadata = { title: "Choose your PIN" };

/** US-1.2: where a learner lands after signing in with a PIN an admin set. */
export default async function ChangePinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/learner");
  if (typeof user.app_metadata?.learner_id !== "string") redirect("/");
  const required = mustChangePin(user.app_metadata);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Choose your PIN</h1>
          </CardTitle>
          <CardDescription>
            {required
              ? "Your school set a PIN for you. Choose your own before you continue, and keep it secret."
              : "Choose a new PIN. Keep it secret."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePinForm pinLength={PIN_LENGTH} />
        </CardContent>
      </Card>
    </main>
  );
}
