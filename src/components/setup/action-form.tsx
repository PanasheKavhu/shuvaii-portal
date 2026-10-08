"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { idle, type FormState } from "@/app/(app)/platform/form-state";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * A setup form whose fields are plain (uncontrolled) inputs passed as
 * children. Submits through a server action without React's automatic form
 * reset, so a rejected form keeps what the admin typed. Field errors are
 * listed under the form, each named by its label.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  labels = {},
  children,
  className,
  submitVariant = "default",
  label,
  resetOnSave = false,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  /** Field name to label, for error messages. */
  labels?: Record<string, string>;
  children?: ReactNode;
  className?: string;
  submitVariant?: "default" | "outline" | "destructive";
  /** Accessible name for the form. */
  label?: string;
  /** Clear the fields after a successful save (forms that add a row). */
  resetOnSave?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = Object.entries(state.errors).filter(([, v]) => v);

  useEffect(() => {
    if (resetOnSave && state.status === "saved") formRef.current?.reset();
  }, [state, resetOnSave]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-label={label}
      className={cn("flex flex-col gap-4", className)}
      noValidate
    >
      {children}
      {fieldErrors.length > 0 && (
        <ul role="alert" className="text-destructive flex flex-col gap-1 text-sm font-medium">
          {fieldErrors.map(([field, message]) => (
            <li key={field}>
              {labels[field] ? `${labels[field]}: ` : ""}
              {message}
            </li>
          ))}
        </ul>
      )}
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" variant={submitVariant} disabled={pending} className="h-12 text-base">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
