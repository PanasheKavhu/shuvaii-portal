"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/people/learners", label: "Learners" },
  { href: "/admin/people/staff", label: "Staff" },
  { href: "/admin/people/import", label: "Import" },
] as const;

/** Learners, staff and imports on /admin/people, current one marked. */
export function PeopleNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="People" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {TABS.map((tab) => {
          const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full border px-5 text-sm font-medium whitespace-nowrap",
                  current
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "hover:bg-muted",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
