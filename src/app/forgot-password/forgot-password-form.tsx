"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESET_CODE_LENGTH } from "@/lib/auth/password-reset";
import { requestReset, verifyResetCode, type ForgotState } from "./actions";

const initialState: ForgotState = { step: "email", email: "", error: null };

export function ForgotPasswordForm() {
  const [requested, requestAction, requesting] = useActionState(requestReset, initialState);
  const [verified, verifyAction, verifying] = useActionState(verifyResetCode, initialState);

  if (requested.step === "email") {
    return (
      <form action={requestAction} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            key={requested.email}
            defaultValue={requested.email}
            className="h-12 text-base"
          />
        </div>
        <FormError message={requested.error} />
        <Button type="submit" disabled={requesting} className="h-12 text-base">
          {requesting ? "Sending…" : "Send reset email"}
        </Button>
        <BackToSignIn />
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-5" noValidate>
      <p role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
        If <strong className="break-all">{requested.email}</strong> has an account, we have sent it
        a link and a {RESET_CODE_LENGTH}-digit code. Open the link, or type the code here.
      </p>
      <input type="hidden" name="email" value={requested.email} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Code from the email</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={RESET_CODE_LENGTH + 4}
          required
          className="h-12 text-base tracking-widest"
        />
      </div>
      <FormError message={verified.error} />
      <Button type="submit" disabled={verifying} className="h-12 text-base">
        {verifying ? "Checking…" : "Continue"}
      </Button>
      <BackToSignIn />
    </form>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm font-medium">
      {message}
    </p>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/sign-in"
      className="text-muted-foreground hover:text-foreground self-center py-2 text-sm underline underline-offset-4"
    >
      Back to sign in
    </Link>
  );
}
