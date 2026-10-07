import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasResetSession } from "@/lib/auth/reset-session";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Where a reset link or code lands (US-1.7). Only the session that the link
 * or code opened may use it; anyone else starts again at /forgot-password.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasResetSession(supabase))) redirect("/forgot-password");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Choose a new password</h1>
          </CardTitle>
          <CardDescription>
            For <span className="break-all">{user.email}</span>. You will be signed out on other
            devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
