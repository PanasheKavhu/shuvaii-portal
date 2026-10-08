import { CheckboxField, SelectField, TextField } from "@/components/setup/fields";
import { LEARNER_STATUSES, LEARNER_STATUS_LABELS } from "@/lib/people/person-input";
import type { LearnerStatus } from "@/lib/people/person-input";

/**
 * Labelled fields for the learner and guardian forms on /admin/people
 * (rendered on the server inside <ActionForm>). Field names match the
 * server actions in app/(app)/admin/people/actions.ts.
 */

export const LEARNER_LABELS = {
  learnerNumber: "Learner number",
  firstName: "First name",
  lastName: "Last name",
  dateOfBirth: "Date of birth",
  sex: "Sex",
  admissionDate: "Admission date",
  status: "Status",
  classId: "Class",
};

export const GUARDIAN_LABELS = {
  guardianName: "Guardian's full name",
  guardianPhone: "Phone",
  guardianEmail: "Email",
  relationship: "Relationship",
};

const SEX_OPTIONS = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
];

export function LearnerFields({
  prefix,
  learner,
  showStatus,
}: {
  prefix: string;
  learner?: {
    learnerNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    sex: "F" | "M" | null;
    admissionDate: string | null;
    status: LearnerStatus;
  };
  showStatus: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-number`}
        name="learnerNumber"
        label={LEARNER_LABELS.learnerNumber}
        defaultValue={learner?.learnerNumber}
        maxLength={30}
      />
      <TextField
        id={`${prefix}-first`}
        name="firstName"
        label={LEARNER_LABELS.firstName}
        defaultValue={learner?.firstName}
        maxLength={80}
      />
      <TextField
        id={`${prefix}-last`}
        name="lastName"
        label={LEARNER_LABELS.lastName}
        defaultValue={learner?.lastName}
        maxLength={80}
      />
      <TextField
        id={`${prefix}-dob`}
        name="dateOfBirth"
        type="date"
        label={LEARNER_LABELS.dateOfBirth}
        defaultValue={learner?.dateOfBirth}
      />
      <SelectField
        id={`${prefix}-sex`}
        name="sex"
        label={LEARNER_LABELS.sex}
        defaultValue={learner?.sex}
        placeholder="Not recorded"
        options={SEX_OPTIONS}
      />
      <TextField
        id={`${prefix}-admitted`}
        name="admissionDate"
        type="date"
        label={LEARNER_LABELS.admissionDate}
        defaultValue={learner?.admissionDate}
      />
      {showStatus && (
        <SelectField
          id={`${prefix}-status`}
          name="status"
          label={LEARNER_LABELS.status}
          defaultValue={learner?.status ?? "active"}
          options={LEARNER_STATUSES.map((s) => ({ value: s, label: LEARNER_STATUS_LABELS[s] }))}
          hint="A learner who leaves is marked here, never deleted."
        />
      )}
    </div>
  );
}

export function GuardianFields({
  prefix,
  guardian,
  primaryLabel = "Primary guardian (first contact)",
  showPrimary = true,
}: {
  prefix: string;
  guardian?: {
    fullName: string;
    phone: string | null;
    email: string | null;
    relationship: string;
    isPrimary: boolean;
  };
  primaryLabel?: string;
  showPrimary?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-gname`}
        name="guardianName"
        label={GUARDIAN_LABELS.guardianName}
        defaultValue={guardian?.fullName}
        maxLength={120}
      />
      <TextField
        id={`${prefix}-relationship`}
        name="relationship"
        label={GUARDIAN_LABELS.relationship}
        defaultValue={guardian?.relationship ?? "guardian"}
        hint="For example mother, father, aunt or guardian."
        maxLength={40}
      />
      <TextField
        id={`${prefix}-gphone`}
        name="guardianPhone"
        type="tel"
        inputMode="tel"
        label={GUARDIAN_LABELS.guardianPhone}
        defaultValue={guardian?.phone}
        maxLength={30}
      />
      <TextField
        id={`${prefix}-gemail`}
        name="guardianEmail"
        type="email"
        inputMode="email"
        label={GUARDIAN_LABELS.guardianEmail}
        defaultValue={guardian?.email}
        maxLength={254}
      />
      {showPrimary && (
        <CheckboxField
          id={`${prefix}-primary`}
          name="isPrimary"
          label={primaryLabel}
          defaultChecked={guardian?.isPrimary}
        />
      )}
    </div>
  );
}
