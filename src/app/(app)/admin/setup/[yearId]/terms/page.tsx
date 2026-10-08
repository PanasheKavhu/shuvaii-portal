import type { Metadata } from "next";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { NextStep } from "@/components/setup/step-nav";
import {
  TERM_KINDS,
  TERM_KIND_LABELS,
  TERM_STATUSES,
  TERM_STATUS_LABELS,
} from "@/lib/setup/calendar";
import { addTerm, saveTerm } from "../../actions";
import { getYear, listTerms, requireSchoolAdmin, type TermRow } from "../../data";

export const metadata: Metadata = { title: "Terms" };

const KIND_OPTIONS = TERM_KINDS.map((k) => ({ value: k, label: TERM_KIND_LABELS[k] }));
const STATUS_OPTIONS = TERM_STATUSES.map((s) => ({ value: s, label: TERM_STATUS_LABELS[s] }));
const LABELS = {
  name: "Name",
  kind: "Kind",
  status: "Status",
  startsOn: "Starts",
  endsOn: "Ends",
  marksDeadline: "Marks deadline",
};

/** US-2.1 and US-2.4: terms with dates, status and marks deadline. */
export default async function TermsPage({ params }: PageProps<"/admin/setup/[yearId]/terms">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const terms = await listTerms(year.id);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        {year.startsOn} to {year.endsOn}. Each term has a status and a marks deadline; locking and
        unlocking marks arrive with marks entry.
      </p>

      <ul aria-label="Terms" className="flex flex-col gap-4">
        {terms.map((term) => (
          <li key={term.id} className="bg-card rounded-2xl border p-4">
            <h2 className="mb-4 font-semibold">{term.name}</h2>
            <ActionForm
              action={saveTerm.bind(null, year.id, term.id)}
              submitLabel={`Save ${term.name}`}
              label={term.name}
              labels={LABELS}
              submitVariant="outline"
            >
              <TermFields prefix={term.id} term={term} />
            </ActionForm>
          </li>
        ))}
      </ul>

      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-4 font-semibold">Add a term or vacation period</h2>
        <ActionForm
          action={addTerm.bind(null, year.id)}
          submitLabel="Add period"
          label="Add a period"
          labels={LABELS}
          resetOnSave
        >
          <TermFields prefix="new" />
        </ActionForm>
      </div>

      <NextStep yearId={year.id} after="/terms" />
    </div>
  );
}

function TermFields({ prefix, term }: { prefix: string; term?: TermRow }) {
  return (
    <>
      <TextField
        id={`${prefix}-name`}
        name="name"
        label="Name"
        defaultValue={term?.name}
        maxLength={60}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${prefix}-kind`}
          name="kind"
          label="Kind"
          defaultValue={term?.kind ?? "term"}
          options={KIND_OPTIONS}
        />
        <SelectField
          id={`${prefix}-status`}
          name="status"
          label="Status"
          defaultValue={term?.status ?? "planned"}
          options={STATUS_OPTIONS}
        />
        <TextField
          id={`${prefix}-startsOn`}
          name="startsOn"
          type="date"
          label="Starts"
          defaultValue={term?.startsOn}
        />
        <TextField
          id={`${prefix}-endsOn`}
          name="endsOn"
          type="date"
          label="Ends"
          defaultValue={term?.endsOn}
        />
        <TextField
          id={`${prefix}-marksDeadline`}
          name="marksDeadline"
          type="date"
          label="Marks deadline"
          defaultValue={term?.marksDeadline}
        />
      </div>
    </>
  );
}
