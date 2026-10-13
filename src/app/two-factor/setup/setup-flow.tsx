"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSetupKey } from "@/lib/auth/two-factor";
import { finishSetup, setupStep, type SetupState } from "../actions";

const initialState: SetupState = { step: "start", error: null };

/**
 * Start, scan the QR code (or type the key), confirm with a code, then see
 * the ten recovery codes once (D54). The steps live in the action state;
 * nothing secret goes in the address.
 */
export function SetupFlow({ enrolled }: { enrolled: boolean }) {
  const [state, formAction, pending] = useActionState(setupStep, initialState);

  if (state.step === "codes") return <RecoveryCodes codes={state.codes} />;
  if (enrolled) {
    return (
      <form action={finishSetup}>
        <Button type="submit" className="h-12 w-full text-base">
          Continue
        </Button>
      </form>
    );
  }

  if (state.step === "scan") {
    return (
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          <li>
            In your authenticator app, add an account and scan this code.
            {/* Auth returns the QR code as an SVG data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.qrCode}
              alt="QR code to add SP Portal to your authenticator app"
              className="mt-3 size-48 rounded-xl border bg-white p-2"
            />
          </li>
          <li>
            Or type this key into the app instead:
            <code
              data-testid="setup-key"
              className="bg-muted mt-2 block rounded-lg px-3 py-2 font-mono text-base break-all"
            >
              {formatSetupKey(state.secret)}
            </code>
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            required
            className="h-12 text-center font-mono text-xl tracking-[0.3em]"
          />
        </div>
        {state.error && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-12 text-base">
          {pending ? "Checking…" : "Confirm"}
        </Button>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Starting…" : "Set up authenticator app"}
      </Button>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-medium">
        Two-factor sign in is on. Save these recovery codes somewhere safe, away from your phone.
        Each one works once if you lose your phone. They will not be shown again.
      </p>
      <ul
        aria-label="Recovery codes"
        className="bg-muted grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl p-3 font-mono text-base"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-5"
        />
        I have saved my recovery codes
      </label>
      <form action={finishSetup}>
        <Button type="submit" disabled={!saved} className="h-12 w-full text-base">
          Continue
        </Button>
      </form>
    </div>
  );
}
