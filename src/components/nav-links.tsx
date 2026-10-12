"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `badge`: a count shown beside the label, such as unread news. */
export type NavLink = { href: string; label: string; badge?: number };

/** Role menu (US-1.8). Items come from navFor(), so it only lists allowed areas. */
export function NavLinks({ items }: { items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted",
            )}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                data-testid="nav-badge"
                className={cn(
                  "ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  active
                    ? "bg-primary-foreground text-primary"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {item.badge}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
