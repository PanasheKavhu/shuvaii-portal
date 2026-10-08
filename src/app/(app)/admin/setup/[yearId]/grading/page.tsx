import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import { LEVEL_STAGES, LEVEL_STAGE_LABELS } from "@/lib/setup/structure";
import { createScale } from "../../actions";
import { getYear, listScales, requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Grading scales" };

const TEMPLATE_OPTIONS = [
  { value: "o_level", label: "O-Level bands from the sample report (A 70 to 100 … U 0 to 39)" },
  { value: "primary", label: "Primary placeholder bands (A 80 to 100 … U 0 to 39)" },
  { value: "", label: "No bands, I will enter them" },
];

/** US-2.3: the school's grading scales. Shared by every year. */
export default async function GradingPage({ params }: PageProps<"/admin/setup/[yearId]/grading">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const scales = await listScales(schoolId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Grading scales belong to the school and are shared by every year. Each grade level uses one
        scale.
      </p>

      {scales.length > 0 && (
        <ul aria-label="Grading scales" className="flex flex-col gap-3">
          {scales.map((scale) => (
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
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-4 font-semibold">New grading scale</h2>
        <ActionForm
          action={createScale.bind(null, year.id)}
          submitLabel="Create scale"
          pendingLabel="Creating…"
          label="New grading scale"
          labels={{ name: "Name", stage: "Stage" }}
        >
          <TextField
            id="scale-name"
            name="name"
            label="Name"
            defaultValue={scales.length ? "" : "O-Level"}
            maxLength={120}
          />
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
            defaultValue="o_level"
            options={TEMPLATE_OPTIONS}
            hint="You can change every band on the next screen."
          />
        </ActionForm>
      </div>

      <NextStep yearId={year.id} after="/grading" />
    </div>
  );
}
