import type { Metadata } from "next";
import Link from "next/link";
import { ResendInviteForm } from "@/components/resend-invite-form";
import { STATUS_TONE, StatusPill } from "@/components/people/status-pill";
import { ActionForm } from "@/components/setup/action-form";
import { SelectField, TextField } from "@/components/setup/fields";
import { getViewer } from "@/lib/auth/viewer";
import { STAFF_ROLES, STAFF_ROLE_LABELS } from "@/lib/people/fields";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/people/person-input";
import {
  addStaffRole,
  resendStaffInviteAction,
  setMembershipStatus,
  updateStaffDetails,
} from "../../actions";
import { getStaffPerson, requireSchoolAdmin } from "../../data";

export const metadata: Metadata = { title: "Staff member" };

const LABELS = { fullName: "Full name", phone: "Phone", role: "Role" };

const ADDED: Record<string, string> = {
  invited: "Added. An invite email is on its way.",
  active: "Added. They already have an account, so they have access now.",
};

/**
 * US-3.3: one staff member's details and roles. A leaver's roles are
 * disabled, never deleted; an invite not yet accepted can be sent again.
 */
export default async function StaffMemberPage({
  params,
  searchParams,
}: PageProps<"/admin/people/staff/[userId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { userId } = await params;
  const { added, invite } = await searchParams;
  const [person, viewer] = await Promise.all([getStaffPerson(schoolId, userId), getViewer()]);
  const isSelf = viewer?.userId === person.userId;
  const invited = person.memberships.some((m) => m.status === "invited");
  const missingRoles = STAFF_ROLES.filter((r) => !person.memberships.some((m) => m.role === r));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/people/staff"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Staff
      </Link>
      <div>
        <h2 className="text-xl font-semibold">{person.fullName}</h2>
        <p className="text-muted-foreground break-all">{person.email}</p>
      </div>
      {typeof added === "string" && ADDED[added] && (
        <p
          role="status"
          className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
        >
          {ADDED[added]}
        </p>
      )}
      {invite === "failed" && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm font-medium"
        >
          Added, but the invite email could not be sent. Use Resend invite below.
        </p>
      )}

      <section
        aria-labelledby="access"
        className="bg-card flex flex-col gap-4 rounded-2xl border p-4"
      >
        <h3 id="access" className="font-semibold">
          Roles and access
        </h3>
        <ul aria-label="Roles" className="flex flex-col divide-y">
          {person.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2">
                {STAFF_ROLE_LABELS[m.role]}
                <StatusPill tone={STATUS_TONE[m.status]}>
                  {MEMBERSHIP_STATUS_LABELS[m.status]}
                </StatusPill>
              </span>
              {!isSelf && (
                <ActionForm
                  action={setMembershipStatus.bind(
                    null,
                    person.userId,
                    m.id,
                    m.status === "disabled" ? "active" : "disabled",
                  )}
                  submitLabel={
                    m.status === "disabled"
                      ? `Re-enable ${STAFF_ROLE_LABELS[m.role].toLowerCase()}`
                      : `Disable ${STAFF_ROLE_LABELS[m.role].toLowerCase()}`
                  }
                  label={`${STAFF_ROLE_LABELS[m.role]} access`}
                  submitVariant={m.status === "disabled" ? "outline" : "destructive"}
                  className="w-full sm:w-auto"
                />
              )}
            </li>
          ))}
        </ul>
        {isSelf && (
          <p className="text-muted-foreground text-sm">You cannot change your own roles.</p>
        )}
        {invited && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              {person.fullName} has not accepted the invite yet.
            </p>
            <ResendInviteForm
              action={resendStaffInviteAction.bind(null, person.userId)}
              email={person.email}
            />
          </div>
        )}
        {!isSelf && missingRoles.length > 0 && (
          <ActionForm
            action={addStaffRole.bind(null, person.userId)}
            submitLabel="Add role"
            label="Add a role"
            labels={LABELS}
            submitVariant="outline"
          >
            <SelectField
              id="add-role"
              name="role"
              label="Add another role"
              options={missingRoles.map((r) => ({ value: r, label: STAFF_ROLE_LABELS[r] }))}
            />
          </ActionForm>
        )}
      </section>

      <section aria-labelledby="details" className="bg-card rounded-2xl border p-4">
        <h3 id="details" className="mb-4 font-semibold">
          Details
        </h3>
        <ActionForm
          action={updateStaffDetails.bind(null, person.userId)}
          submitLabel="Save details"
          label="Staff details"
          labels={LABELS}
          submitVariant="outline"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="staff-name"
              name="fullName"
              label={LABELS.fullName}
              defaultValue={person.fullName}
              maxLength={120}
            />
            <TextField
              id="staff-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              label={LABELS.phone}
              defaultValue={person.phone}
              maxLength={30}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            The email is their sign-in, so it cannot be changed here.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
