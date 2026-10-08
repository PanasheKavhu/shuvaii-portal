import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/viewer";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getViewer()) redirect("/");
  const { invite } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Sign in</CardTitle>
          <CardDescription>Use the email address your school registered for you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {invite === "invalid" && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              That invite link has expired or was already used. Sign in if you have set a password,
              or ask for a new invite.
            </p>
          )}
          <SignInForm />
          <div className="flex flex-col gap-1 border-t pt-4 text-center text-sm">
            <Link
              href="/sign-in/learner"
              className="text-muted-foreground hover:text-foreground py-2 underline underline-offset-4"
            >
              Learner? Sign in with your learner number
            </Link>
            <Link
              href="/join"
              className="text-muted-foreground hover:text-foreground py-2 underline underline-offset-4"
            >
              Parent with a code from the school? Set up your account
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
