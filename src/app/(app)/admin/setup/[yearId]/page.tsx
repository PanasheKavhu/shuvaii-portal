import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { describeGap, type SetupGap } from "@/lib/setup/gaps";
import { SETUP_STEPS } from "@/lib/setup/steps";
import { finishSetup, makeCurrentYear } from "../actions";
import { getYear, loadYearSetup, requireSchoolAdmin } from "../data";

export const metadata: Metadata = { title: "Check and finish" };

/** Where to fix a gap. */
function gapHref(yearId: string, gap: SetupGap): string {
  const base = `/admin/setup/${yearId}`;
  switch (gap.kind) {
    case "no-terms":
      return `${base}/terms`;
    case "no-classes":
    case "no-class-teacher":
      return `${base}/classes`;
    case "no-subjects":
    case "no-subject-teacher":
      return `${base}/classes/${gap.classId}`;
    case "incomplete-scale":
      return `${base}/grading`;
  }
}

/**
 * US-2.1 wizard hub: progress per step, the gaps that block finishing, and
 * the Finish button.
 */
export default async function YearSetupPage({ params }: PageProps<"/admin/setup/[yearId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const setup = await loadYearSetup(schoolId, year.id);
  const withTeacher = setup.classSubjects.filter((cs) => cs.teacherId).length;

  const progress: Record<string, string> = {
    "/terms": `${setup.terms.length} period${setup.terms.length === 1 ? "" : "s"}`,
    "/grading": `${setup.scales.length} scale${setup.scales.length === 1 ? "" : "s"}`,
    "/levels": `${setup.levels.length} level${setup.levels.length === 1 ? "" : "s"}`,
    "/subjects": `${setup.subjects.length} subject${setup.subjects.length === 1 ? "" : "s"}`,
    "/classes": `${setup.classes.length} class${setup.classes.length === 1 ? "" : "es"}, ${setup.classes.filter((c) => c.classTeacherId).length} with a class teacher`,
    "/class-subjects": `${setup.classSubjects.length} class subject${setup.classSubjects.length === 1 ? "" : "s"}, ${withTeacher} with a teacher`,
  };

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Progress" className="flex flex-col gap-2">
        {SETUP_STEPS.filter((s) => s.path).map((step, i) => (
          <li key={step.path}>
            <Link
              href={`/admin/setup/${year.id}${step.path}`}
              className="bg-card hover:bg-muted/60 flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4"
            >
              <span className="font-medium">
                {i + 1}. {step.label}
              </span>
              <span className="text-muted-foreground text-right text-sm">
                {progress[step.path]}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {setup.gaps.length > 0 ? (
        <section
          aria-labelledby="gaps-heading"
          className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-2xl border p-4"
        >
          <h2 id="gaps-heading" className="text-destructive font-semibold">
            {setup.gaps.length === 1
              ? "1 gap to fix before finishing"
              : `${setup.gaps.length} gaps to fix before finishing`}
          </h2>
          <ul aria-label="Setup gaps" className="flex flex-col gap-1">
            {setup.gaps.map((gap, i) => (
              <li key={i}>
                <Link href={gapHref(year.id, gap)} className="flex min-h-11 items-center underline">
                  {describeGap(gap)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 font-medium text-emerald-800 dark:text-emerald-300">
          {year.setupCompletedAt
            ? "Setup is finished. Every class has a class teacher and every class subject has a teacher."
            : "No gaps: every class has a class teacher and every class subject has a teacher."}
        </p>
      )}

      {!year.setupCompletedAt && (
        <ActionForm
          action={finishSetup.bind(null, year.id)}
          submitLabel="Finish setup"
          pendingLabel="Checking…"
          label="Finish setup"
        />
      )}
      {year.setupCompletedAt && !year.isCurrent && (
        <ActionForm
          action={makeCurrentYear.bind(null, year.id)}
          submitLabel={`Make ${year.label} the current year`}
          label="Current year"
          submitVariant="outline"
        />
      )}
    </div>
  );
}
