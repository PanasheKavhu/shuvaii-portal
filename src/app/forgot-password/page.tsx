import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

/** US-1.7: staff (and parents, once they have accounts) reset by email. */
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { link } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Reset your password</h1>
          </CardTitle>
          <CardDescription>
            Enter the email address you sign in with. Learners: ask your school office to reset your
            PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {link === "invalid" && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              That reset link has expired or was already used. Ask for a new one below.
            </p>
          )}
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
