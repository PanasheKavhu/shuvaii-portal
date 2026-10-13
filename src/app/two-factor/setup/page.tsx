import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { twoFactorState } from "../state";
import { TwoFactorShell } from "../two-factor-shell";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = { title: "Set up two-factor sign in" };

/**
 * Enrolment (D54): a super admin, school admin or head with no confirmed
 * authenticator app sets one up here before anything else opens. A person
 * who just finished stays on the page (confirming refreshes it) until they
 * have seen their recovery codes.
 */
export default async function SetupPage({ searchParams }: PageProps<"/two-factor/setup">) {
  const { enrolled, passed } = await twoFactorState();
  if (enrolled && !passed) redirect("/two-factor");
  const { recovered } = await searchParams;

  return (
    <TwoFactorShell
      title="Set up two-factor sign in"
      description={
        recovered === "1"
          ? "You signed in with a recovery code, which is now used up. Set up your authenticator app again to get new codes."
          : "Your role needs a second step at sign in: a 6-digit code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator."
      }
    >
      <SetupFlow enrolled={enrolled} />
    </TwoFactorShell>
  );
}
