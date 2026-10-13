import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { twoFactorState } from "../state";
import { TwoFactorShell } from "../two-factor-shell";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Use a recovery code" };

/** Signing in with a recovery code instead of the app (D54). */
export default async function RecoveryPage() {
  const { enrolled, passed } = await twoFactorState();
  if (!enrolled) redirect("/two-factor/setup");
  if (passed) redirect("/");

  return (
    <TwoFactorShell
      title="Use a recovery code"
      description="Enter one of the ten recovery codes you saved when you set up two-factor sign in. Each code works once. You will then set up your authenticator app again."
    >
      <RecoveryForm />
      <Link
        href="/two-factor"
        className="text-muted-foreground hover:text-foreground self-center py-2 text-sm underline underline-offset-4"
      >
        Use the code from your app instead
      </Link>
    </TwoFactorShell>
  );
}
