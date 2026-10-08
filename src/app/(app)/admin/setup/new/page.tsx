import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import {
  TERM_KINDS,
  TERM_KIND_LABELS,
  TERM_STATUSES,
  TERM_STATUS_LABELS,
  nextYearLabel,
  proposeCalendar,
} from "@/lib/setup/calendar";
import { createYear } from "../actions";
import { listYears, requireSchoolAdmin } from "../data";

export const metadata: Metadata = { title: "New academic year" };

const KIND_OPTIONS = TERM_KINDS.map((k) => ({ value: k, label: TERM_KIND_LABELS[k] }));
const STATUS_OPTIONS = TERM_STATUSES.map((s) => ({ value: s, label: TERM_STATUS_LABELS[s] }));

/**
 * US-2.1 step 1: a new year with proposed terms (three terms and the April
 * vacation school). Every field is editable before saving.
 */
export default async function NewYearPage({ searchParams }: PageProps<"/admin/setup/new">) {
  const { schoolId } = await requireSchoolAdmin();
  const years = await listYears(schoolId);
  const asked = (await searchParams).label;
  const label =
    typeof asked === "string" && /^\d{4}$/.test(asked)
      ? asked
      : nextYearLabel(
          years.map((y) => y.label),
          new Date(),
        );
  const { year, terms } = proposeCalendar(label);

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin/setup" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School setup
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New academic year</h1>
        <p className="text-muted-foreground mt-1">
          We have proposed three terms and a vacation school period. The dates are a starting point:
          change them to your school&apos;s calendar.
        </p>
      </div>

      <ActionForm
        action={createYear}
        submitLabel="Create year and terms"
        pendingLabel="Creating…"
        label="New academic year"
        labels={{ label: "Year", startsOn: "First day", endsOn: "Last day" }}
      >
        <fieldset className="bg-card flex flex-col gap-4 rounded-2xl border p-4">
          <legend className="px-1 font-semibold">Year</legend>
          <TextField
            id="label"
            name="label"
            label="Year"
            defaultValue={year.label}
            maxLength={20}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="startsOn"
              name="startsOn"
              type="date"
              label="First day"
              defaultValue={year.startsOn}
            />
            <TextField
              id="endsOn"
              name="endsOn"
              type="date"
              label="Last day"
              defaultValue={year.endsOn}
            />
          </div>
        </fieldset>

        <input type="hidden" name="termCount" value={terms.length} />
        {terms.map((term, i) => (
          <fieldset key={i} className="bg-card flex flex-col gap-4 rounded-2xl border p-4">
            <legend className="px-1 font-semibold">Period {i + 1}</legend>
            <TextField
              id={`term-${i}-name`}
              name={`term-${i}-name`}
              label="Name"
              defaultValue={term.name}
              maxLength={60}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id={`term-${i}-kind`}
                name={`term-${i}-kind`}
                label="Kind"
                defaultValue={term.kind}
                options={KIND_OPTIONS}
              />
              <SelectField
                id={`term-${i}-status`}
                name={`term-${i}-status`}
                label="Status"
                defaultValue={term.status}
                options={STATUS_OPTIONS}
              />
              <TextField
                id={`term-${i}-startsOn`}
                name={`term-${i}-startsOn`}
                type="date"
                label="Starts"
                defaultValue={term.startsOn}
              />
              <TextField
                id={`term-${i}-endsOn`}
                name={`term-${i}-endsOn`}
                type="date"
                label="Ends"
                defaultValue={term.endsOn}
              />
              <TextField
                id={`term-${i}-marksDeadline`}
                name={`term-${i}-marksDeadline`}
                type="date"
                label="Marks deadline"
                defaultValue={term.marksDeadline}
                hint="Teachers finish entering marks by this day."
              />
            </div>
          </fieldset>
        ))}
      </ActionForm>
    </section>
  );
}
