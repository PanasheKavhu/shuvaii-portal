import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import { saveClass } from "../../actions";
import {
  getYear,
  listClasses,
  listLevels,
  listTeachers,
  requireSchoolAdmin,
  teacherLabel,
  type ClassRow,
} from "../../data";

export const metadata: Metadata = { title: "Classes" };

const LABELS = { name: "Class name", gradeLevelId: "Grade level", classTeacherId: "Class teacher" };

/**
 * US-2.1 and US-2.2: this year's classes and their class teachers. A
 * teacher (or head of department) may be class teacher of several classes.
 */
export default async function ClassesPage({ params }: PageProps<"/admin/setup/[yearId]/classes">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const [classes, levels, teachers] = await Promise.all([
    listClasses(year.id),
    listLevels(schoolId),
    listTeachers(schoolId),
  ]);
  const levelOptions = levels.map((l) => ({ value: l.id, label: l.name }));
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: teacherLabel(t) }));

  return (
    <div className="flex flex-col gap-6">
      {levels.length === 0 && (
        <p className="bg-muted/40 rounded-xl border border-dashed p-4">
          Add grade levels first: every class belongs to one.
        </p>
      )}
      {teachers.length === 0 && (
        <p className="bg-muted/40 rounded-xl border border-dashed p-4">
          The school has no active teachers yet, so classes can be added but not given a class
          teacher.
        </p>
      )}

      <ul aria-label="Classes" className="flex flex-col gap-4">
        {classes.map((c) => (
          <li key={c.id} className="bg-card rounded-2xl border p-4">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{c.name}</h2>
              <Link
                href={`/admin/setup/${year.id}/classes/${c.id}`}
                className="text-primary min-h-11 content-center text-sm font-medium underline"
              >
                Subjects and teachers<span className="sr-only"> for {c.name}</span>
              </Link>
            </div>
            <ActionForm
              action={saveClass.bind(null, year.id, c.id)}
              submitLabel={`Save ${c.name}`}
              label={c.name}
              labels={LABELS}
              submitVariant="outline"
            >
              <ClassFields
                prefix={c.id}
                row={c}
                levelOptions={levelOptions}
                teacherOptions={teacherOptions}
              />
            </ActionForm>
          </li>
        ))}
      </ul>

      {levels.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="mb-4 font-semibold">Add a class</h2>
          <ActionForm
            action={saveClass.bind(null, year.id, null)}
            submitLabel="Add class"
            label="Add a class"
            labels={LABELS}
            resetOnSave
          >
            <ClassFields prefix="new" levelOptions={levelOptions} teacherOptions={teacherOptions} />
          </ActionForm>
        </div>
      )}

      <NextStep yearId={year.id} after="/classes" />
    </div>
  );
}

function ClassFields({
  prefix,
  row,
  levelOptions,
  teacherOptions,
}: {
  prefix: string;
  row?: ClassRow;
  levelOptions: { value: string; label: string }[];
  teacherOptions: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label="Class name"
        defaultValue={row?.name}
        maxLength={60}
      />
      <SelectField
        id={`${prefix}-level`}
        name="gradeLevelId"
        label="Grade level"
        defaultValue={row?.gradeLevelId ?? levelOptions[0]?.value}
        options={levelOptions}
      />
      <SelectField
        id={`${prefix}-teacher`}
        name="classTeacherId"
        label="Class teacher"
        defaultValue={row?.classTeacherId}
        placeholder="No class teacher yet"
        options={teacherOptions}
      />
    </div>
  );
}
