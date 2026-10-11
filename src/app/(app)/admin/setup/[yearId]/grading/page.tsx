import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import { LEVEL_STAGES, LEVEL_STAGE_LABELS } from "@/lib/setup/structure";
import { createScale } from "../../actions";
import { getYear, listClasses, listLevels, listScales, requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Grading scales" };

// Starting points to edit, not defaults (D38): each school enters its own key.
const TEMPLATE_OPTIONS = [
  { value: "o_level", label: "O-level sample key (A 70 to 100 … U 0 to 39), to edit" },
  { value: "primary", label: "Primary example (A 80 to 100 … U 0 to 39), to edit" },
  { value: "blank", label: "Blank, I will enter our bands" },
];

/**
 * US-2.3: the school's grading scales, shared by every year, and which scale
 * each grade level uses. Grading is the school's own choice (D38); a level
 * with classes needs a complete scale before setup finishes or a term opens.
 */
export default async function GradingPage({ params }: PageProps<"/admin/setup/[yearId]/grading">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const [scales, levels, classes] = await Promise.all([
    listScales(schoolId),
    listLevels(schoolId),
    listClasses(year.id),
  ]);
  const scaleById = new Map(scales.map((s) => [s.id, s]));
  const levelsWithClasses = new Set(classes.map((c) => c.gradeLevelId));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Enter your school&apos;s own grading key. Scales belong to the school and are shared by
        every year; each grade level uses one scale, and different levels may use different scales.
      </p>

      {levels.length > 0 && (
        <section aria-labelledby="level-scales-heading" className="flex flex-col gap-2">
          <h2 id="level-scales-heading" className="font-semibold">
            Scale used by each grade level
          </h2>
          <ul aria-label="Scale used by each grade level" className="flex flex-col gap-2">
            {levels.map((level) => {
              const scale = scaleById.get(level.gradingScaleId);
              const blocks = !scale?.complete && levelsWithClasses.has(level.id);
              return (
                <li
                  key={level.id}
                  className="bg-card flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border px-4 py-2"
                >
                  <span className="font-medium">{level.name}</span>
                  <span
                    className={
                      scale?.complete
                        ? "text-muted-foreground text-sm"
                        : "text-destructive text-sm font-medium"
                    }
                  >
                    {scale?.name ?? "No scale"}
                    {scale?.complete
                      ? " · Complete"
                      : blocks
                        ? " · Not complete: blocks finishing and opening terms"
                        : " · Not complete"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-sm">
            Change a level&apos;s scale on the Grade levels step.
          </p>
        </section>
      )}

      {scales.length > 0 && (
        <ul aria-label="Grading scales" className="flex flex-col gap-3">
          {scales.map((scale) => {
            const usedBy = levels.filter((l) => l.gradingScaleId === scale.id).map((l) => l.name);
            return (
              <li key={scale.id}>
                <Link
                  href={`/admin/setup/${year.id}/grading/${scale.id}`}
                  className="bg-card hover:bg-muted/60 flex min-h-16 flex-col justify-center gap-1 rounded-2xl border p-4"
                >
                  <span className="font-semibold">
                    {scale.name}
                    {scale.isDefault && " · Default"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {LEVEL_STAGE_LABELS[scale.stage]} ·{" "}
                    {scale.bands.map((b) => `${b.grade} ${b.minMark}-${b.maxMark}`).join(", ") ||
                      "No bands"}
                    {!scale.complete && " · Needs fixing"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {usedBy.length ? `Used by ${usedBy.join(", ")}` : "Not used by a grade level"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-4 font-semibold">New grading scale</h2>
        <ActionForm
          action={createScale.bind(null, year.id)}
          submitLabel="Create scale"
          pendingLabel="Creating…"
          label="New grading scale"
          labels={{ name: "Name", stage: "Stage", template: "Start from" }}
        >
          <TextField id="scale-name" name="name" label="Name" maxLength={120} />
          <SelectField
            id="scale-stage"
            name="stage"
            label="Stage"
            defaultValue="o_level"
            options={LEVEL_STAGES.map((s) => ({ value: s, label: LEVEL_STAGE_LABELS[s] }))}
          />
          <SelectField
            id="scale-template"
            name="template"
            label="Start from"
            placeholder="Choose a starting point"
            options={TEMPLATE_OPTIONS}
            hint="Samples are starting points, not a national key: change every band to match your school's own key on the next screen."
          />
        </ActionForm>
      </div>

      <NextStep yearId={year.id} after="/grading" />
    </div>
  );
}
