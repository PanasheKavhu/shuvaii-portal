import type { Metadata } from "next";
import { NextStep } from "@/components/setup/step-nav";
import { describeSet } from "@/lib/marks/assessments";
import { TERM_KIND_LABELS } from "@/lib/setup/calendar";
import { saveAssessmentSet } from "../../actions";
import { getYear, listAssessmentSets, requireSchoolAdmin } from "../../data";
import { AssessmentSetEditor } from "./set-editor";

export const metadata: Metadata = { title: "Usual assessments" };

/**
 * D41: the school's usual assessment set per term kind (names, types,
 * maximums and weights adding up to 100). Teachers add it in one tap on
 * each class subject's assessments screen. Shared by every year.
 */
export default async function UsualAssessmentsPage({
  params,
}: PageProps<"/admin/setup/[yearId]/assessments">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const sets = await listAssessmentSets(schoolId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        The assessments that usually make up a subject&apos;s mark, for each kind of period.
        Teachers add the set in one tap and can still change it per class subject. Weights must add
        up to 100. Sets belong to the school and are shared by every year.
      </p>

      {sets.map((set) => {
        const kind = TERM_KIND_LABELS[set.termKind];
        return (
          <section
            key={set.termKind}
            aria-labelledby={`set-${set.termKind}`}
            className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
          >
            <div>
              <h2 id={`set-${set.termKind}`} className="font-semibold">
                {kind}
              </h2>
              <p className="text-muted-foreground text-sm">
                {set.saved
                  ? `Your school's set: ${describeSet(set.items)}.`
                  : "Not set yet: teachers get the starting set below. Change it to match your school, then save."}
              </p>
            </div>
            <AssessmentSetEditor
              action={saveAssessmentSet.bind(null, year.id, set.termKind)}
              label={`Usual ${kind.toLowerCase()} assessments`}
              items={set.items}
            />
          </section>
        );
      })}

      <NextStep yearId={year.id} after="/assessments" />
    </div>
  );
}
