import type { Metadata } from "next";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import { LEVEL_STAGES, LEVEL_STAGE_LABELS } from "@/lib/setup/structure";
import { saveLevel } from "../../actions";
import { getYear, listLevels, listScales, requireSchoolAdmin, type LevelRow } from "../../data";

export const metadata: Metadata = { title: "Grade levels" };

const LABELS = {
  name: "Name",
  stage: "Stage",
  sortOrder: "Order",
  gradingScaleId: "Grading scale",
};
const STAGE_OPTIONS = LEVEL_STAGES.map((s) => ({ value: s, label: LEVEL_STAGE_LABELS[s] }));

/** US-2.1: grade levels (Form 1, Grade 5, ...), each with its grading scale. */
export default async function LevelsPage({ params }: PageProps<"/admin/setup/[yearId]/levels">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const [levels, scales] = await Promise.all([listLevels(schoolId), listScales(schoolId)]);
  const scaleOptions = scales.map((s) => ({ value: s.id, label: s.name }));
  const defaultScale = scales.find((s) => s.isDefault) ?? scales[0];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Grade levels belong to the school and are shared by every year. Classes are made for a
        level.
      </p>

      {scales.length === 0 && (
        <p className="bg-muted/40 rounded-xl border border-dashed p-4">
          Create a grading scale first: every grade level needs one.
        </p>
      )}

      <ul aria-label="Grade levels" className="flex flex-col gap-4">
        {levels.map((level) => (
          <li key={level.id} className="bg-card rounded-2xl border p-4">
            <h2 className="mb-4 font-semibold">{level.name}</h2>
            <ActionForm
              action={saveLevel.bind(null, year.id, level.id)}
              submitLabel={`Save ${level.name}`}
              label={level.name}
              labels={LABELS}
              submitVariant="outline"
            >
              <LevelFields prefix={level.id} level={level} scaleOptions={scaleOptions} />
            </ActionForm>
          </li>
        ))}
      </ul>

      {scales.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="mb-4 font-semibold">Add a grade level</h2>
          <ActionForm
            action={saveLevel.bind(null, year.id, null)}
            submitLabel="Add grade level"
            label="Add a grade level"
            labels={LABELS}
            resetOnSave
          >
            <LevelFields
              prefix="new"
              scaleOptions={scaleOptions}
              defaults={{ stage: defaultScale?.stage, gradingScaleId: defaultScale?.id }}
            />
          </ActionForm>
        </div>
      )}

      <NextStep yearId={year.id} after="/levels" />
    </div>
  );
}

function LevelFields({
  prefix,
  level,
  scaleOptions,
  defaults,
}: {
  prefix: string;
  level?: LevelRow;
  scaleOptions: { value: string; label: string }[];
  defaults?: { stage?: string; gradingScaleId?: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label="Name"
        defaultValue={level?.name}
        maxLength={60}
      />
      <SelectField
        id={`${prefix}-stage`}
        name="stage"
        label="Stage"
        defaultValue={level?.stage ?? defaults?.stage ?? "o_level"}
        options={STAGE_OPTIONS}
      />
      <SelectField
        id={`${prefix}-scale`}
        name="gradingScaleId"
        label="Grading scale"
        defaultValue={level?.gradingScaleId ?? defaults?.gradingScaleId}
        options={scaleOptions}
      />
      <TextField
        id={`${prefix}-order`}
        name="sortOrder"
        label="Order"
        type="number"
        inputMode="numeric"
        defaultValue={level?.sortOrder ?? ""}
        hint="Lower numbers are listed first."
      />
    </div>
  );
}
