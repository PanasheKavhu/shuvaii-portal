import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { STAFF_ROLES, STAFF_ROLE_LABELS } from "@/lib/people/fields";
import { addStaff } from "../../actions";
import { requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Add a staff member" };

const LABELS = { fullName: "Full name", email: "Email", phone: "Phone", role: "Role" };

/** US-3.3: add one staff member; they get the same Auth invite as the console sends. */
export default async function NewStaffPage() {
  await requireSchoolAdmin();
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/people/staff"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Staff
      </Link>
      <h2 className="text-xl font-semibold">Add a staff member</h2>
      <p className="text-muted-foreground text-sm">
        They get an email invite to set their password. Someone who already has an SP Portal account
        (for example at another school) gets access straight away.
      </p>
      <div className="bg-card rounded-2xl border p-4">
        <ActionForm
          action={addStaff}
          submitLabel="Add and invite"
          pendingLabel="Inviting…"
          label="Add a staff member"
          labels={LABELS}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="staff-name" name="fullName" label={LABELS.fullName} maxLength={120} />
            <TextField
              id="staff-email"
              name="email"
              type="email"
              inputMode="email"
              label={LABELS.email}
              maxLength={254}
            />
            <TextField
              id="staff-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              label={`${LABELS.phone} (optional)`}
              maxLength={30}
            />
            <SelectField
              id="staff-role"
              name="role"
              label={LABELS.role}
              defaultValue="teacher"
              options={STAFF_ROLES.map((r) => ({ value: r, label: STAFF_ROLE_LABELS[r] }))}
            />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
