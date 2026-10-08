import type { Metadata } from "next";
import Link from "next/link";
import {
  GUARDIAN_LABELS,
  GuardianFields,
  LEARNER_LABELS,
  LearnerFields,
} from "@/components/people/person-fields";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField } from "@/components/setup/fields";
import { addLearner } from "../../actions";
import { currentYear, isPrimaryStage, listYearClasses, requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Add a learner" };

/** US-3.3: add one learner with this year's class and, optionally, a guardian. */
export default async function NewLearnerPage() {
  const { schoolId } = await requireSchoolAdmin();
  const year = await currentYear(schoolId);
  const classes = year ? await listYearClasses(year.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/people/learners"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Learners
      </Link>
      <h2 className="text-xl font-semibold">Add a learner</h2>
      <ActionForm
        action={addLearner}
        submitLabel="Add learner"
        pendingLabel="Adding…"
        label="Add a learner"
        labels={{ ...LEARNER_LABELS, ...GUARDIAN_LABELS }}
        className="gap-6"
      >
        <fieldset className="bg-card flex flex-col gap-4 rounded-2xl border p-4">
          <legend className="px-1 font-semibold">Learner</legend>
          <LearnerFields prefix="new" showStatus={false} />
          <SelectField
            id="new-class"
            name="classId"
            label={year ? `Class in ${year.label}` : "Class"}
            placeholder={classes.length ? "No class yet" : "No classes set up yet"}
            options={classes.map((c) => ({
              value: c.id,
              label: isPrimaryStage(c.stage) ? `${c.name} (takes all class subjects)` : c.name,
            }))}
          />
        </fieldset>
        <fieldset className="bg-card flex flex-col gap-4 rounded-2xl border p-4">
          <legend className="px-1 font-semibold">Guardian (optional)</legend>
          <p className="text-muted-foreground text-sm">
            A guardian with the same phone or email as one already at the school is linked to them,
            so brothers and sisters share one guardian.
          </p>
          <GuardianFields prefix="new" showPrimary={false} />
        </fieldset>
      </ActionForm>
    </div>
  );
}
