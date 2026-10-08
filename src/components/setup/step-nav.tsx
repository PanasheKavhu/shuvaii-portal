"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETUP_STEPS, stepIndexFor } from "@/lib/setup/steps";
import { cn } from "@/lib/utils";

/** The wizard's steps for one year, scrollable on a phone, current step marked. */
export function StepNav({ yearId }: { yearId: string }) {
  const pathname = usePathname();
  const base = `/admin/setup/${yearId}`;
  const current = stepIndexFor(pathname, yearId);

  return (
    <nav aria-label="Setup steps" className="-mx-4 overflow-x-auto px-4">
      <ol className="flex w-max gap-2">
        {SETUP_STEPS.map((step, i) => (
          <li key={step.path}>
            <Link
              href={base + step.path}
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap",
                i === current
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-muted",
              )}
            >
              <span aria-hidden="true">{i + 1}</span>
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** "Next: ..." link at the bottom of each step. */
export function NextStep({ yearId, after }: { yearId: string; after: string }) {
  const i = SETUP_STEPS.findIndex((s) => s.path === after);
  const next = SETUP_STEPS[i + 1];
  if (!next) return null;
  return (
    <Link
      href={`/admin/setup/${yearId}${next.path}`}
      className="bg-primary text-primary-foreground flex h-12 items-center justify-center rounded-lg px-4 text-base font-medium"
    >
      Next: {next.label}
    </Link>
  );
}
