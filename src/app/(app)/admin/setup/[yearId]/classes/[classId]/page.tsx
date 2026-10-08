import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField, SelectField } from "@/components/setup/fields";
import { isUuid } from "@/lib/setup/structure";
import { addClassSubjects, removeClassSubject, setSubjectTeacher } from "../../../actions";
import {
  getYear,
  listClassSubjects,
  listClasses,
  listSubjects,
  listTeachers,
  requireSchoolAdmin,
  teacherLabel,
} from "../../../data";

export const metadata: Metadata = { title: "Class subjects" };

/**
 * US-2.2: the subjects a class takes, each with exactly one teacher. A
 * teacher may take many subjects across classes and grades.
 */
export default async function ClassSubjectsPage({
  params,
}: PageProps<"/admin/setup/[yearId]/classes/[classId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId, classId } = await params;
  const year = await getYear(schoolId, yearId);
  if (!isUuid(classId)) notFound();
  const [classes, subjects, teachers] = await Promise.all([
    listClasses(year.id),
    listSubjects(schoolId),
    listTeachers(schoolId),
  ]);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();
  const rows = await listClassSubjects([klass.id]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const taken = new Set(rows.map((r) => r.subjectId));
  const available = subjects.filter((s) => !taken.has(s.id));
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: teacherLabel(t) }));
  const ordered = [...rows].sort((a, b) =>
    (subjectName.get(a.subjectId) ?? "").localeCompare(subjectName.get(b.subjectId) ?? ""),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/setup/${year.id}/class-subjects`}
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← All classes
      </Link>
      <h2 className="text-xl font-semibold">{klass.name}: subjects and teachers</h2>

      {ordered.length === 0 ? (
        <p className="bg-muted/40 rounded-xl border border-dashed p-4">
          No subjects yet. Tick the subjects this class takes below.
        </p>
      ) : (
        <ul aria-label={`Subjects in ${klass.name}`} className="flex flex-col gap-3">
          {ordered.map((row) => {
            const name = subjectName.get(row.subjectId) ?? "Subject";
            return (
              <li key={row.id} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
                <h3 className="font-semibold">
                  {name}
                  {!row.teacherId && (
                    <span className="text-destructive ml-2 text-sm font-medium">
                      No teacher yet
                    </span>
                  )}
                </h3>
                <ActionForm
                  action={setSubjectTeacher.bind(null, year.id, row.id)}
                  submitLabel={`Save teacher for ${name}`}
                  label={`Teacher for ${name}`}
                  submitVariant="outline"
                >
                  <SelectField
                    id={`teacher-${row.id}`}
                    name="teacherId"
                    label={`Teacher for ${name}`}
                    defaultValue={row.teacherId}
                    placeholder="No teacher yet"
                    options={teacherOptions}
                  />
                </ActionForm>
                <ActionForm
                  action={removeClassSubject.bind(null, year.id, row.id)}
                  submitLabel={`Remove ${name} from ${klass.name}`}
                  pendingLabel="Removing…"
                  submitVariant="outline"
                />
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <h2 className="mb-2 font-semibold">Add subjects</h2>
          <ActionForm
            action={addClassSubjects.bind(null, year.id, klass.id)}
            submitLabel="Add ticked subjects"
            label="Add subjects"
            resetOnSave
          >
            <fieldset className="flex flex-col">
              <legend className="text-muted-foreground mb-1 text-sm">
                Subjects {klass.name} takes
              </legend>
              {available.map((s) => (
                <CheckboxField
                  key={s.id}
                  id={`add-${s.id}`}
                  name="subjectId"
                  value={s.id}
                  label={s.name}
                />
              ))}
            </fieldset>
            <SelectField
              id="add-teacher"
              name="teacherId"
              label="Teacher for the ticked subjects"
              placeholder="No teacher yet, I will choose later"
              options={teacherOptions}
            />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
