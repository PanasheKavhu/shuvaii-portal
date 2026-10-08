import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatInviteCode, hashInviteCode, normalizeInviteCode } from "@/lib/auth/invite-code";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/new-password";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { ExistingAccountForm, NewParentForm } from "./join-forms";

export const metadata: Metadata = { title: "Parent account" };

const PROBLEMS: Record<string, string> = {
  used: "This code was already used. If you set up the account, sign in with your email and password.",
  expired: "This code has expired. Ask the school office for a new one.",
  unknown: "We could not find that code. Check it and try again.",
};

/**
 * US-1.3: where a parent's invite link or typed code lands. A usable code
 * shows the school and who it is for, then lets a new parent make an
 * account, or a signed-in person add the children to their own. A used,
 * expired or unknown code says so plainly.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code: rawCode } = await searchParams;
  const typed = typeof rawCode === "string" ? rawCode : "";
  const code = normalizeInviteCode(typed);

  let problem: string | null = typed && !code ? PROBLEMS.unknown : null;
  let invite: {
    schoolName: string;
    guardianName: string;
    guardianEmail: string;
    children: number;
  } | null = null;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("parent_invite_preview", {
      p_code_hash: hashInviteCode(code),
    });
    if (error || !data[0]) throw new Error("Could not check the code");
    const row = data[0];
    if (row.status === "valid") {
      invite = {
        schoolName: row.school_name ?? "",
        guardianName: row.guardian_name ?? "",
        guardianEmail: row.guardian_email ?? "",
        children: row.children ?? 0,
      };
    } else {
      problem = PROBLEMS[row.status] ?? PROBLEMS.unknown;
    }
  }
  const viewer = invite ? await getViewer() : null;
  const childrenText = invite
    ? invite.children === 1
      ? "your child"
      : `your ${invite.children} children`
    : "";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>{invite ? `Join ${invite.schoolName}` : "Parent account"}</h1>
          </CardTitle>
          <CardDescription>
            {invite
              ? `This code is for ${invite.guardianName}. It links ${childrenText} to your account.`
              : "Enter the code the school gave you to set up your parent account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {problem && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              {problem}
            </p>
          )}

          {!invite && (
            <form method="get" action="/join" className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Code from the school</Label>
                <Input
                  id="code"
                  name="code"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  placeholder="XXXX-XXXX-XXXX"
                  required
                  defaultValue={typed}
                  className="h-12 text-base tracking-wider uppercase"
                />
              </div>
              <Button type="submit" className="h-12 text-base">
                Continue
              </Button>
            </form>
          )}

          {invite && code && viewer && (
            <>
              <p className="text-sm">
                You are signed in as <span className="font-medium">{viewer.fullName || "you"}</span>
                . Add {childrenText} at {invite.schoolName} to this account?
              </p>
              <ExistingAccountForm code={code} label="Add to my account" />
            </>
          )}

          {invite && code && !viewer && (
            <>
              <p className="text-muted-foreground text-sm">
                Code <span className="font-mono">{formatInviteCode(code)}</span>. Already have an
                account?{" "}
                <Link href="/sign-in" className="underline underline-offset-4">
                  Sign in
                </Link>{" "}
                first, then open this link again.
              </p>
              <NewParentForm
                code={code}
                fullName={invite.guardianName}
                email={invite.guardianEmail}
                minPasswordLength={MIN_PASSWORD_LENGTH}
              />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
