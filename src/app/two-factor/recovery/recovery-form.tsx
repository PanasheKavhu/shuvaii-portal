"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemRecoveryCode, type CodeState } from "../actions";

const initialState: CodeState = { error: null };

export function RecoveryForm() {
  const [state, formAction, pending] = useActionState(redeemRecoveryCode, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Recovery code</Label>
        <Input
          id="code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          required
          placeholder="XXXXX-XXXXX"
          className="h-12 font-mono text-base tracking-wider"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Checking…" : "Sign in with this code"}
      </Button>
    </form>
  );
}
