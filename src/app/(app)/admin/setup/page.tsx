import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listYears, requireSchoolAdmin } from "./data";

export const metadata: Metadata = { title: "School setup" };

/** US-2.1 setup area home: the school's years and a way to set up a new one. */
export default async function SetupPage() {
  const { schoolId, schoolName } = await requireSchoolAdmin();
  const years = await listYears(schoolId);

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School admin
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">{schoolName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">School setup</h1>
        </div>
        <Link
          href="/admin/setup/new"
          className={buttonVariants({ className: "h-11 rounded-full px-5 text-base" })}
        >
          Set up a new year
        </Link>
      </div>

      {years.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No academic years yet. Set up the first one: the wizard proposes terms and a grading scale
          you can change.
        </p>
      ) : (
        <ul aria-label="Academic years" className="grid gap-3 sm:grid-cols-2">
          {years.map((year) => (
            <li key={year.id}>
              <Link
                href={`/admin/setup/${year.id}`}
                className="bg-card hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-20 flex-col justify-center gap-1 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="flex items-center gap-2 font-semibold">
                  {year.label}
                  {year.isCurrent && (
                    <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                      Current
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {year.startsOn} to {year.endsOn} ·{" "}
                  {year.setupCompletedAt ? "Set up" : "Setup in progress"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
