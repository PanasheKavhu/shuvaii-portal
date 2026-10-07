"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, describedBy, inputClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkAccentColor, checkPrimaryColor, type ColorCheck } from "@/lib/branding/brand-colors";
import { isHexColor, readableOn } from "@/lib/branding/contrast";
import type { FormState } from "../../form-state";
import { idle } from "../../form-state";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * US-1.5 colours. The contrast check runs as you type (same pure functions
 * the server action enforces), with a one-tap fix when a colour fails.
 */
export function ColorsForm({
  action,
  primary,
  accent,
}: {
  action: Action;
  primary: string;
  accent: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [primaryColor, setPrimaryColor] = useState(primary);
  const [accentColor, setAccentColor] = useState(accent);
  const primaryCheck = checkPrimaryColor(primaryColor);
  const accentCheck = checkAccentColor(accentColor);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <ColorField
          id="primaryColor"
          label="Primary colour"
          hint="Buttons, links and headings."
          value={primaryColor}
          onChange={setPrimaryColor}
          check={primaryCheck}
          serverError={state.errors.primaryColor}
        />
        <ColorField
          id="accentColor"
          label="Accent colour"
          hint="Stripes and badges."
          value={accentColor}
          onChange={setAccentColor}
          check={accentCheck}
          serverError={state.errors.accentColor}
        />
      </div>

      <Preview primary={primaryColor} accent={accentColor} />

      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Saving…" : "Save colours"}
      </Button>
    </form>
  );
}

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  check,
  serverError,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  check: ColorCheck;
  serverError?: string;
}) {
  // The live check and the server run the same rule; the server message only
  // matters for an empty field, which the live check leaves quiet.
  const error = check.ok ? undefined : value ? check.message : serverError;
  return (
    <Field
      id={id}
      label={label}
      hint={check.ok ? `${hint} Contrast ${check.ratio}:1, passes AA.` : hint}
      error={error}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Pick ${label.toLowerCase()}`}
          value={isHexColor(value) && value.length === 7 ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
        />
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="#0b5fa5"
          autoCapitalize="none"
          spellCheck={false}
          className={`${inputClass} font-mono`}
          {...describedBy(id, error, hint)}
        />
      </div>
      {!check.ok && check.suggestion && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-fit"
          onClick={() => onChange(check.suggestion)}
        >
          Use {check.suggestion}
        </Button>
      )}
    </Field>
  );
}

/** A small sample of how the colours look: a button, a link and an accent badge. */
function Preview({ primary, accent }: { primary: string; accent: string }) {
  const p = isHexColor(primary) ? primary : "#171717";
  const a = isHexColor(accent) ? accent : "#e5e5e5";
  return (
    <div
      aria-label="Preview"
      role="group"
      className="overflow-hidden rounded-xl border bg-white text-neutral-900"
    >
      <div className="h-1.5" style={{ backgroundColor: a }} />
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium"
          style={{ backgroundColor: p, color: readableOn(p) }}
        >
          Button
        </span>
        <span className="text-sm font-semibold underline" style={{ color: p }}>
          A link
        </span>
        <span
          className="inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold"
          style={{ backgroundColor: a, color: readableOn(a) }}
        >
          Badge
        </span>
      </div>
    </div>
  );
}
