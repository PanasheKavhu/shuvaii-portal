import type { Metadata } from "next";
import Link from "next/link";
import { RolloverForm } from "@/components/rollover/rollover-form";
import { buttonVariants } from "@/components/ui/button";
import { nextYearLabel } from "@/lib/setup/calendar";
import { requireSchoolAdmin } from "../setup/data";
import { loadRollover } from "./data";

export const metadata: Metadata = { title: "Roll over the year" };

/**
 * US-3.5 (D53): at year end the school admin moves the current year's
 * learners into the next year. Each class gets a proposed class at the next
 * level (or graduates); single learners can repeat, leave or graduate; a
 * preview shows exactly what will happen before anything changes, and the
 * next year becomes current only when the admin confirms it.
 */
export default async function RolloverPage({ searchParams }: PageProps<"/admin/rollover">) {
  const { schoolId, schoolName } = await requireSchoolAdmin();
  const asked = (await searchParams).to;
  const view = await loadRollover(schoolId, typeof asked === "string" ? asked : undefined);
  const { fromYear, toYear } = view;

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School admin
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Roll over{fromYear ? ` ${fromYear.label}` : " the year"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Move each class up a level, mark repeaters and leavers, and graduate the final level.
          Marks, comments and published reports stay exactly as they are.
        </p>
      </div>

      {!fromYear ? (
        <Empty>
          The school has no current year yet. Finish setting up a year in{" "}
          <Link href="/admin/setup" className="text-primary underline">
            School setup
          </Link>{" "}
          first.
        </Empty>
      ) : !toYear ? (
        <div className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
          <p>
            Set up the next year&apos;s dates and terms first. You can add its classes there, or let
            the rollover create them.
          </p>
          <Link
            href={`/admin/setup/new?label=${nextYearLabel([fromYear.label], new Date())}`}
            className={buttonVariants({ className: "h-12 w-fit rounded-full px-5 text-base" })}
          >
            Set up the next year
          </Link>
        </div>
      ) : (
        <>
          {view.laterYears.length > 1 && (
            <nav aria-label="Next year" className="flex flex-wrap gap-2">
              {view.laterYears.map((y) => (
                <Link
                  key={y.id}
                  href={`/admin/rollover?to=${y.id}`}
                  aria-current={y.id === toYear.id ? "page" : undefined}
                  className={buttonVariants({
                    variant: y.id === toYear.id ? "default" : "outline",
                    className: "h-11 rounded-full px-5",
                  })}
                >
                  Into {y.label}
                </Link>
              ))}
            </nav>
          )}

          <RolloverForm
            key={toYear.id}
            fromLabel={fromYear.label}
            toYear={{ id: toYear.id, label: toYear.label, isCurrent: toYear.isCurrent }}
            classes={view.classes}
            nextClasses={view.nextClasses}
            levels={view.levels}
            nextYearLearners={view.nextYearLearners}
          />
        </>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
      {children}
    </p>
  );
}
