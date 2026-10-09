import type { Metadata } from "next";
import { ClassSubjectHeader } from "@/components/marks/class-subject-header";
import { LockNotice } from "@/components/marks/lock-notice";
import { WeightTally } from "@/components/marks/weight-tally";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABELS,
  describeSet,
  usualSet,
  weightTotal,
} from "@/lib/marks/assessments";
import {
  addUsualAssessments,
  createAssessment,
  deleteAssessment,
  relockMarks,
  unlockMarks,
  updateAssessment,
} from "../../../actions";
import { getLockState, listAssessments, listUnlockers, loadClassSubjectPage } from "../../../data";

export const metadata: Metadata = { title: "Assessments" };

const TYPE_OPTIONS = ASSESSMENT_TYPES.map((t) => ({ value: t, label: ASSESSMENT_TYPE_LABELS[t] }));
const LABELS = {
  name: "Name",
  type: "Type",
  maxMark: "Out of",
  weightPercent: "Weight (%)",
};

/**
 * US-4.1: the assessments of one class subject in a term, with maximum mark
 * and weight, a running weight total that must reach 100, and the school's
 * usual set as a one-tap start.
 */
export default async function AssessmentsPage({
  params,
}: PageProps<"/marks/[classSubjectId]/[termId]/assessments">) {
  const { classSubjectId, termId } = await params;
  const { actor, cst } = await loadClassSubjectPage(classSubjectId, termId);
  const [assessments, lock] = await Promise.all([
    listAssessments(cst.classSubjectId, cst.term.id),
    getLockState(cst.classSubjectId, cst.term.id),
  ]);
  const readOnly = lock.teachersLocked && !actor.isAdminOrHead;
  const unlockers = readOnly ? await listUnlockers(actor.schoolId) : [];
  const set = usualSet(cst.term.kind);
  const subject = `${cst.subjectName} for ${cst.className}`;

  return (
    <div className="flex flex-col gap-6">
      <ClassSubjectHeader
        classSubjectId={cst.classSubjectId}
        termId={cst.term.id}
        subjectName={cst.subjectName}
        className={cst.className}
        termName={cst.term.name}
        teacherName={cst.teacherName}
        backHref={
          actor.isAdminOrHead ? `/marks?term=${cst.term.id}` : `/teaching?term=${cst.term.id}`
        }
        backLabel={actor.isAdminOrHead ? "All marks" : "My classes"}
        current="assessments"
      />
      <LockNotice
        lock={lock}
        isAdminOrHead={actor.isAdminOrHead}
        subject={subject}
        unlockers={unlockers}
        unlockAction={unlockMarks.bind(null, cst.classSubjectId, cst.term.id)}
        relockAction={relockMarks.bind(null, cst.classSubjectId, cst.term.id)}
      />

      <WeightTally
        savedTotal={weightTotal(assessments.map((a) => a.weightPercent))}
        savedCount={assessments.length}
      >
        {assessments.length === 0 && !readOnly && (
          <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
            <h2 className="text-lg font-semibold">Start with the usual set</h2>
            <p className="text-muted-foreground text-sm">
              {set.map((a) => `${a.name} out of ${a.maxMark} at ${a.weightPercent}%`).join(", ")}.
              You can change any of them afterwards.
            </p>
            <ActionForm
              action={addUsualAssessments.bind(null, cst.classSubjectId, cst.term.id)}
              submitLabel={`Add ${describeSet(set)}`}
              pendingLabel="Adding…"
              label="Usual assessments"
            />
          </section>
        )}

        {assessments.length > 0 && (
          <ol aria-label="Assessments" className="flex flex-col gap-3">
            {assessments.map((a) => (
              <li key={a.id} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
                {readOnly || (a.isLocked && !actor.isAdminOrHead) ? (
                  <p>
                    <span className="font-semibold">{a.name}</span> ·{" "}
                    {ASSESSMENT_TYPE_LABELS[a.type]} · out of {a.maxMark} · {a.weightPercent}%
                    <input type="hidden" name="weightPercent" value={a.weightPercent} />
                  </p>
                ) : (
                  <>
                    <ActionForm
                      action={updateAssessment.bind(null, a.id)}
                      submitLabel={`Save ${a.name}`}
                      label={a.name}
                      labels={LABELS}
                      submitVariant="outline"
                    >
                      <AssessmentFields prefix={a.id} values={a} />
                    </ActionForm>
                    <ActionForm
                      action={deleteAssessment.bind(null, a.id)}
                      submitLabel={`Remove ${a.name}`}
                      pendingLabel="Removing…"
                      submitVariant="destructive"
                      label={`Remove ${a.name}`}
                    />
                  </>
                )}
              </li>
            ))}
          </ol>
        )}

        {!readOnly && (
          <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
            <h2 className="text-lg font-semibold">Add an assessment</h2>
            <ActionForm
              action={createAssessment.bind(null, cst.classSubjectId, cst.term.id)}
              submitLabel="Add assessment"
              pendingLabel="Adding…"
              label="Add an assessment"
              labels={LABELS}
              resetOnSave
            >
              <AssessmentFields prefix="new" />
            </ActionForm>
          </section>
        )}
      </WeightTally>
    </div>
  );
}

function AssessmentFields({
  prefix,
  values,
}: {
  prefix: string;
  values?: { name: string; type: string; maxMark: string; weightPercent: string };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label="Name"
        defaultValue={values?.name}
        maxLength={80}
        className="col-span-2 sm:col-span-1"
      />
      <SelectField
        id={`${prefix}-type`}
        name="type"
        label="Type"
        defaultValue={values?.type ?? "test"}
        options={TYPE_OPTIONS}
        className="col-span-2 sm:col-span-1"
      />
      <TextField
        id={`${prefix}-max`}
        name="maxMark"
        label="Out of"
        inputMode="decimal"
        defaultValue={values?.maxMark}
      />
      <TextField
        id={`${prefix}-weight`}
        name="weightPercent"
        label="Weight (%)"
        inputMode="decimal"
        defaultValue={values?.weightPercent}
      />
    </div>
  );
}
