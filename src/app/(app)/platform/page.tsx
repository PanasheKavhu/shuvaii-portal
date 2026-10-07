import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { SchoolLogo } from "@/components/theme/school-logo";
import { buttonVariants } from "@/components/ui/button";
import { requireArea } from "@/lib/auth/viewer";
import { isHexColor, readableOn } from "@/lib/branding/contrast";
import { logoUrl } from "@/lib/branding/theme";
import { STAGE_LABELS } from "@/lib/platform/school-input";
import { supabaseUrl } from "@/lib/supabase/env";
import { listSchools } from "./data";

/** Shows the initials badge in the school's own colour. */
function badgeStyle(color: string | null): CSSProperties | undefined {
  if (!isHexColor(color)) return undefined;
  return { "--primary": color, "--primary-foreground": readableOn(color) } as CSSProperties;
}

export const metadata: Metadata = { title: "Platform" };

/** Super-admin console home (SPEC E10): every school, and a way to add one. */
export default async function PlatformPage() {
  await requireArea("platform");
  const schools = await listSchools();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Super-admin console</p>
          <h1 className="text-2xl font-semibold tracking-tight">Schools</h1>
        </div>
        <Link
          href="/platform/schools/new"
          className={buttonVariants({ className: "h-11 rounded-full px-5 text-base" })}
        >
          New school
        </Link>
      </div>

      {schools.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No schools yet. Create the first one.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {schools.map((school) => (
            <li key={school.id}>
              <Link
                href={`/platform/schools/${school.id}`}
                className="bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-20 items-center gap-4 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="flex" style={badgeStyle(school.primaryColor)}>
                  <SchoolLogo name={school.name} url={logoUrl(school.logoPath, supabaseUrl())} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{school.name}</span>
                  <span className="text-muted-foreground truncate text-sm">
                    {school.slug} · {STAGE_LABELS[school.stage].split(" ")[0]}
                    {school.status !== "active" && ` · ${school.status}`}
                  </span>
                </span>
                <span aria-hidden className="flex gap-1">
                  {[school.primaryColor, school.accentColor].map((c, i) =>
                    isHexColor(c) ? (
                      <span
                        key={i}
                        className="size-4 rounded-full border"
                        style={{ backgroundColor: c }}
                      />
                    ) : null,
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
