import type { Metadata } from "next";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField, SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import { SUBJECT_SCOPES, SUBJECT_SCOPE_LABELS } from "@/lib/setup/structure";
import { saveSubject } from "../../actions";
import { getYear, listSubjects, requireSchoolAdmin, type SubjectRow } from "../../data";

export const metadata: Metadata = { title: "Subjects" };

const LABELS = { code: "Code", name: "Name", stageScope: "Taught in", sortOrder: "Order" };
const SCOPE_OPTIONS = SUBJECT_SCOPES.map((s) => ({ value: s, label: SUBJECT_SCOPE_LABELS[s] }));

/** US-2.1: the school's subjects, shared by every year. */
export default async function SubjectsPage({
  params,
}: PageProps<"/admin/setup/[yearId]/subjects">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const subjects = await listSubjects(schoolId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Use the subject names you want printed on reports. Subjects are shared by every year.
      </p>

      <ul aria-label="Subjects" className="flex flex-col gap-4">
        {subjects.map((subject) => (
          <li key={subject.id} className="bg-card rounded-2xl border p-4">
            <h2 className="mb-4 font-semibold">
              {subject.name}{" "}
              <span className="text-muted-foreground font-normal">{subject.code}</span>
            </h2>
            <ActionForm
              action={saveSubject.bind(null, year.id, subject.id)}
              submitLabel={`Save ${subject.name}`}
              label={subject.name}
              labels={LABELS}
              submitVariant="outline"
            >
              <SubjectFields prefix={subject.id} subject={subject} />
            </ActionForm>
          </li>
        ))}
      </ul>

      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-4 font-semibold">Add a subject</h2>
        <ActionForm
          action={saveSubject.bind(null, year.id, null)}
          submitLabel="Add subject"
          label="Add a subject"
          labels={LABELS}
          resetOnSave
        >
          <SubjectFields prefix="new" />
        </ActionForm>
      </div>

      <NextStep yearId={year.id} after="/subjects" />
    </div>
  );
}

function SubjectFields({ prefix, subject }: { prefix: string; subject?: SubjectRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label="Name"
        defaultValue={subject?.name}
        maxLength={80}
      />
      <TextField
        id={`${prefix}-code`}
        name="code"
        label="Code"
        defaultValue={subject?.code}
        maxLength={12}
        hint="Short code, like MATH."
      />
      <SelectField
        id={`${prefix}-scope`}
        name="stageScope"
        label="Taught in"
        defaultValue={subject?.stageScope ?? "secondary"}
        options={SCOPE_OPTIONS}
      />
      <TextField
        id={`${prefix}-order`}
        name="sortOrder"
        label="Order"
        type="number"
        inputMode="numeric"
        defaultValue={subject?.sortOrder ?? ""}
        hint="Order on the report."
      />
      <CheckboxField
        id={`${prefix}-core`}
        name="isCore"
        label="Core subject (every learner takes it)"
        defaultChecked={subject?.isCore}
      />
    </div>
  );
}
