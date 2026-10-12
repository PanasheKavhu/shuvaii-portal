import Link from "next/link";
import type { ReactNode } from "react";

/** Shared pieces of the read-only browse profiles (US-9.2, D51). */

export function BackToOverview() {
  return (
    <Link
      href="/admin"
      className="text-muted-foreground flex min-h-11 w-fit items-center text-sm hover:underline"
    >
      ← Overview
    </Link>
  );
}

export function ProfileSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="bg-card rounded-2xl border p-4 shadow-xs">
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}
