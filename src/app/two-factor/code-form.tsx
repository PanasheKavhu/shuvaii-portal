"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyCode, type CodeState } from "./actions";

const initialState: CodeState = { error: null };

export function CodeForm() {
  const [state, formAction, pending] = useActionState(verifyCode, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={9}
          required
          autoFocus
          className="h-12 text-center font-mono text-xl tracking-[0.3em]"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
