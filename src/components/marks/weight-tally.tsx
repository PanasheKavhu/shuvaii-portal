"use client";

import { useState, type ReactNode } from "react";
import { weightMessage, weightTotal } from "@/lib/marks/assessments";
import { cn } from "@/lib/utils";

/**
 * The running weight total under the assessments (US-4.1, Q5). Starts from
 * the saved weights and follows every weight field inside it as the
 * teacher types, so the total is right before anything is saved.
 */
export function WeightTally({
  savedTotal,
  savedCount,
  children,
}: {
  savedTotal: number;
  savedCount: number;
  children: ReactNode;
}) {
  const [live, setLive] = useState<{ total: number; count: number } | null>(null);
  // A save or removal changes the saved weights: start again from them.
  const [saved, setSaved] = useState({ savedTotal, savedCount });
  if (saved.savedTotal !== savedTotal || saved.savedCount !== savedCount) {
    setSaved({ savedTotal, savedCount });
    setLive(null);
  }

  function recount(container: HTMLElement) {
    const weights = [...container.querySelectorAll<HTMLInputElement>('input[name="weightPercent"]')]
      .map((input) => input.value.trim())
      .filter((v) => v !== "");
    setLive({ total: weightTotal(weights), count: weights.length });
  }

  const { total, count } = live ?? { total: savedTotal, count: savedCount };
  const message = weightMessage(total, count);

  return (
    <div className="flex flex-col gap-4" onInput={(e) => recount(e.currentTarget)}>
      <p
        role="status"
        aria-label="Weight total"
        className={cn(
          "rounded-xl px-4 py-3 text-sm font-medium",
          message.ok
            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
        )}
      >
        {message.text}
      </p>
      {children}
    </div>
  );
}
