"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/new-password";
import { acceptInvite, declineInvite, type WelcomeState } from "./actions";

const initialState: WelcomeState = { error: null };

export function WelcomeForm({ needsPassword }: { needsPassword: boolean }) {
  const [state, formAction, pending] = useActionState(acceptInvite, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {needsPassword && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-hint"
              className="h-12 text-base"
            />
            <p id="password-hint" className="text-muted-foreground text-sm">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              className="h-12 text-base"
            />
          </div>
        </>
      )}
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Saving…" : needsPassword ? "Set password and continue" : "Accept"}
      </Button>
    </form>
  );
}

export function DeclineForm() {
  const [state, formAction, pending] = useActionState(declineInvite, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending} className="h-12 text-base">
        Decline
      </Button>
    </form>
  );
}
