import type { ReactNode } from "react";
import { selectClass } from "@/components/platform/form-bits";
import { cn } from "@/lib/utils";

/**
 * Labelled, uncontrolled inputs for the setup forms (rendered on the
 * server inside <ActionForm>). Every input has a visible label and a
 * 48px tap target.
 */

const inputClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

function Wrap({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm leading-none font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  id,
  name,
  label,
  defaultValue,
  hint,
  type = "text",
  className,
  inputMode,
  maxLength,
  autoComplete = "off",
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | number | null;
  autoComplete?: string;
  hint?: string;
  type?: "text" | "date" | "number" | "email" | "tel";
  className?: string;
  inputMode?: "numeric" | "decimal" | "text" | "email" | "tel";
  maxLength?: number;
}) {
  return (
    <Wrap id={id} label={label} hint={hint} className={className}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={inputClass}
      />
    </Wrap>
  );
}

export function SelectField({
  id,
  name,
  label,
  defaultValue,
  options,
  placeholder,
  hint,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  options: readonly { value: string; label: string }[];
  /** A first, empty option such as "No teacher yet". */
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Wrap id={id} label={label} hint={hint} className={className}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={selectClass}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckboxField({
  id,
  name,
  label,
  defaultChecked,
  value = "on",
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
  value?: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-12 items-center gap-3 text-base">
      <input
        id={id}
        name={name}
        type="checkbox"
        value={value}
        defaultChecked={defaultChecked}
        className="accent-primary size-5 shrink-0"
      />
      {label}
    </label>
  );
}
