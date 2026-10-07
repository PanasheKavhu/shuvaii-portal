import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A labelled form field with an optional hint and error, linked for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

/** aria props for an input inside <Field>. */
export function describedBy(id: string, error?: string, hint?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/** Form-level outcome: a saved confirmation or an error. */
export function FormMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "saved";
  message: string | null;
}) {
  if (!message) return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium",
        status === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      )}
    >
      {message}
    </p>
  );
}

export const inputClass = "h-12 text-base";
export const selectClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 aria-invalid:border-destructive";
