import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CodeForm } from "./code-form";
import { twoFactorState } from "./state";
import { TwoFactorShell } from "./two-factor-shell";

export const metadata: Metadata = { title: "Sign-in code" };

/** The second step of sign in (D54): the code from the person's authenticator app. */
export default async function TwoFactorPage() {
  const { enrolled, passed } = await twoFactorState();
  if (!enrolled) redirect("/two-factor/setup");
  if (passed) redirect("/");

  return (
    <TwoFactorShell
      title="Enter your sign-in code"
      description="Open your authenticator app and enter the 6-digit code it shows for SP Portal."
    >
      <CodeForm />
      <Link
        href="/two-factor/recovery"
        className="text-muted-foreground hover:text-foreground self-center py-2 text-sm underline underline-offset-4"
      >
        No phone? Use a recovery code
      </Link>
    </TwoFactorShell>
  );
}
