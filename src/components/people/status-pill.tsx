import type { ReactNode } from "react";
import type { MembershipStatus } from "@/lib/people/person-input";
import { cn } from "@/lib/utils";

/** Pill tone for a staff membership status. */
export const STATUS_TONE: Record<MembershipStatus, "good" | "warn" | "muted"> = {
  active: "good",
  invited: "warn",
  disabled: "muted",
};

/** A small pill for a status such as Invited or Left. */
export function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "good" | "warn" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "good" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
        tone === "warn" && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "neutral" && "bg-primary/10 text-foreground",
      )}
    >
      {children}
    </span>
  );
}
