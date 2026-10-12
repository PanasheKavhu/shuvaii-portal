import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackToOverview } from "@/components/oversight/profile-bits";
import { SelectField } from "@/components/setup/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadExportChoices, requireExporter } from "./data";

export const metadata: Metadata = { title: "Exports" };

const ERRORS: Record<string, string> = {
  choose: "Choose a class and a term, then try again.",
  "wrong-term": "That term is not in the class's year. Choose both again.",
  failed: "The export could not be made. Please try again.",
};

/**
 * US-9.4: the school admin's Excel exports (D52). Learners with their
 * guardians for the whole school; marks or comments for one class and
 * term, from any year. Each download is made on the server when asked for,
 * recorded in the audit log and never stored.
 */
export default async function ExportsPage({ searchParams }: PageProps<"/admin/exports">) {
  const exporter = await requireExporter();
  const params = await searchParams;
  const { years, year, classes, terms, termId } = await loadExportChoices(
    exporter.schoolId,
    params.year,
  );
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <BackToOverview />
      <div>
        <p className="text-muted-foreground text-sm">{exporter.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="text-muted-foreground mt-1">
          Download the school&apos;s records as Excel files. They hold personal details, so keep
          them safe; each download is recorded in the audit log.
        </p>
      </div>

      {error && (
        <p role="alert" className="border-destructive text-destructive rounded-2xl border p-4">
          {error}
        </p>
      )}

      <Card
        id="learners"
        title="Learners and guardians"
        text="Every learner, leavers included, with their class and each guardian's contact details."
      >
        <form method="post" action="/admin/exports/download">
          <input type="hidden" name="kind" value="learners" />
          <Button type="submit" className="h-12 w-full text-base sm:w-auto">
            Download learners
          </Button>
        </form>
      </Card>

      <Card
        id="class"
        title="Marks and comments for a class"
        text="One row per learner of the class. Marks: a column for each subject and assessment. Comments: each subject teacher's and the class teacher's."
      >
        {years.length > 1 && (
          <nav aria-label="Year" className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Link
                key={y.id}
                href={`/admin/exports?year=${y.id}`}
                aria-current={y.id === year?.id ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                  y.id === year?.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card",
                )}
              >
                {y.label}
              </Link>
            ))}
          </nav>
        )}
        {classes.length === 0 || terms.length === 0 ? (
          <p className="text-muted-foreground">
            {year
              ? `${year.label} has no ${classes.length === 0 ? "classes" : "terms"} yet.`
              : "Set up a year in school setup first."}
          </p>
        ) : (
          <form method="post" action="/admin/exports/download" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="export-class"
                name="class"
                label="Class"
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
              <SelectField
                id="export-term"
                name="term"
                label="Term"
                defaultValue={termId}
                options={terms.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="submit"
                name="kind"
                value="marks"
                className="h-12 w-full text-base sm:w-auto"
              >
                Download marks
              </Button>
              <Button
                type="submit"
                name="kind"
                value="comments"
                variant="outline"
                className="h-12 w-full text-base sm:w-auto"
              >
                Download comments
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function Card({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{text}</p>
      </div>
      {children}
    </section>
  );
}
