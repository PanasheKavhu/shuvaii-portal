"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePin, type ChangePinState } from "./actions";

const initialState: ChangePinState = { error: null };

export function ChangePinForm({ pinLength }: { pinLength: number }) {
  const [state, formAction, pending] = useActionState(changePin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">New PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          aria-describedby="pin-hint"
          className="h-12 text-base tracking-widest"
        />
        <p id="pin-hint" className="text-muted-foreground text-sm">
          {pinLength} digits. Not a repeat or a run like 123456.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm PIN</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          className="h-12 text-base tracking-widest"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Saving…" : "Save PIN and continue"}
      </Button>
    </form>
  );
}
