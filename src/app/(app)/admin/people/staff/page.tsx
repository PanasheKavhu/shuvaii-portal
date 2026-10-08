import type { Metadata } from "next";
import Link from "next/link";
import { selectClass } from "@/components/platform/form-bits";
import { STATUS_TONE, StatusPill } from "@/components/people/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { STAFF_ROLES, STAFF_ROLE_LABELS, isStaffRole } from "@/lib/people/fields";
import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_LABELS,
  searchWords,
  type MembershipStatus,
} from "@/lib/people/person-input";
import { listStaff, personStatus, requireSchoolAdmin } from "../data";

export const metadata: Metadata = { title: "Staff" };

const fieldClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** US-3.3: the school's staff with their roles, searchable by name or email. */
export default async function StaffPage({ searchParams }: PageProps<"/admin/people/staff">) {
  const { schoolId } = await requireSchoolAdmin();
  const params = await searchParams;
  const query = one(params.q).slice(0, 100);
  const role = isStaffRole(one(params.role)) ? one(params.role) : "";
  const statusParam = one(params.status);
  const status = (MEMBERSHIP_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as MembershipStatus)
    : "";

  const words = searchWords(query).map((w) => w.toLowerCase());
  const staff = (await listStaff(schoolId)).filter((p) => {
    const hay = `${p.fullName} ${p.email}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
    if (role && !p.memberships.some((m) => m.role === role)) return false;
    if (status && personStatus(p) !== status) return false;
    return true;
  });
  const filtered = Boolean(query || role || status);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/people/staff/new"
          className={buttonVariants({ className: "h-11 rounded-full px-5 text-base" })}
        >
          Add a staff member
        </Link>
        <Link
          href="/admin/people/import"
          className={buttonVariants({
            variant: "outline",
            className: "h-11 rounded-full px-5 text-base",
          })}
        >
          Import staff
        </Link>
      </div>

      <form role="search" aria-label="Find staff" className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            Name or email
          </label>
          <input id="q" name="q" type="search" defaultValue={query} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="role" className="text-sm font-medium">
            Role
          </label>
          <select id="role" name="role" defaultValue={role} className={selectClass}>
            <option value="">All roles</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className={selectClass}>
            <option value="">Everyone</option>
            {MEMBERSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MEMBERSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", className: "h-12 text-base sm:w-fit" })}
        >
          Search
        </button>
      </form>

      <p className="text-muted-foreground text-sm" role="status">
        {staff.length === 0
          ? filtered
            ? "No staff match."
            : "No staff yet."
          : `${staff.length} ${staff.length === 1 ? "person" : "people"}`}
      </p>

      {staff.length > 0 && (
        <ul aria-label="Staff" className="bg-card divide-y rounded-2xl border">
          {staff.map((p) => {
            const overall = personStatus(p);
            return (
              <li key={p.userId}>
                <Link
                  href={`/admin/people/staff/${p.userId}`}
                  className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{p.fullName}</span>
                    <span className="text-muted-foreground text-sm break-all">{p.email}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    {p.memberships.map((m) => STAFF_ROLE_LABELS[m.role]).join(", ")}
                    {overall !== "active" && (
                      <StatusPill tone={STATUS_TONE[overall]}>
                        {MEMBERSHIP_STATUS_LABELS[overall]}
                      </StatusPill>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
