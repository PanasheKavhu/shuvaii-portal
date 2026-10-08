"use client";

import { useActionState } from "react";
import { selectClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInLearner, type LearnerSignInState } from "./actions";

export function LearnerSignInForm({
  schools,
  defaultSchoolId,
  pinLength,
}: {
  schools: { id: string; name: string }[];
  defaultSchoolId: string;
  pinLength: number;
}) {
  const [state, formAction, pending] = useActionState<LearnerSignInState, FormData>(signInLearner, {
    error: null,
    schoolId: defaultSchoolId,
    learnerNumber: "",
  });

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="schoolId">School</Label>
        <select
          id="schoolId"
          name="schoolId"
          required
          key={`school-${state.schoolId}`}
          defaultValue={state.schoolId}
          className={selectClass}
        >
          <option value="" disabled>
            Choose your school
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="learnerNumber">Learner number</Label>
        <Input
          id="learnerNumber"
          name="learnerNumber"
          autoComplete="username"
          autoCapitalize="characters"
          required
          key={`number-${state.learnerNumber}`}
          defaultValue={state.learnerNumber}
          className="h-12 text-base"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          aria-describedby="pin-hint"
          className="h-12 text-base tracking-widest"
        />
        <p id="pin-hint" className="text-muted-foreground text-sm">
          {pinLength} digits.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
