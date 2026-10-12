import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { BackToOverview } from "@/components/oversight/profile-bits";
import {
  GUARDIAN_PAGE_SIZE,
  parseGuardianFilter,
  parsePage,
  type GuardianFilter,
} from "@/lib/oversight/summary";
import { cn } from "@/lib/utils";
import { loadGuardians, requireOverseer } from "../oversight-data";

export const metadata: Metadata = { title: "Parents and guardians" };

const TABS: { filter: GuardianFilter; label: string }[] = [
  { filter: "never", label: "Never signed in" },
  { filter: "linked", label: "With a parent login" },
];

/**
 * The guardians behind the overview's parent counts (US-9.1, D51): those
 * of active learners who never signed in, or who have a parent login. A
 * parent code is made on the learner's People page, which the school admin
 * opens from here; the head opens the learner's profile.
 */
export default async function ParentsPage({ searchParams }: PageProps<"/admin/parents">) {
  const o = await requireOverseer();
  if (!o.isAdminOrHead) forbidden();
  const params = await searchParams;
  const filter = parseGuardianFilter(params.show);
  const page = parsePage(params.page);
  const { guardians, total } = await loadGuardians(o.schoolId, filter, page, GUARDIAN_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / GUARDIAN_PAGE_SIZE));
  const learnerHref = (id: string) =>
    o.isAdmin ? `/admin/people/learners/${id}` : `/admin/browse/learners/${id}`;

  return (
    <div className="flex flex-col gap-5">
      <BackToOverview />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parents and guardians</h1>
        <p className="text-muted-foreground mt-1">
          Guardians of active learners.{" "}
          {filter === "never"
            ? o.isAdmin
              ? "Open a learner to give their guardian a parent code."
              : "The school admin gives each a parent code from the learner's page."
            : "Those who have a parent login."}
        </p>
      </div>
      <nav aria-label="Show" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.filter}
            href={`/admin/parents?show=${t.filter}`}
            aria-current={filter === t.filter ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
              filter === t.filter ? "bg-primary text-primary-foreground border-primary" : "bg-card",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p role="status" className="text-muted-foreground text-sm">
        {total === 1 ? "1 guardian" : `${total} guardians`}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>
      {guardians.length > 0 && (
        <ul aria-label="Guardians" className="bg-card divide-y rounded-2xl border">
          {guardians.map((g) => (
            <li key={g.id} className="flex flex-col gap-1 px-4 py-3">
              <span className="font-medium">{g.name}</span>
              <span className="text-muted-foreground text-sm">
                {[
                  g.phone,
                  g.hasLogin
                    ? g.lastSignInAt
                      ? "Signed in"
                      : "Has a login, never used"
                    : "No login yet",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <ul className="flex flex-wrap gap-x-4">
                {g.learners.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={learnerHref(l.id)}
                      className="text-primary flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {l.name} ({l.number})
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/parents?show=${filter}&page=${page - 1}`}
              className="bg-card flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
            >
              Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={`/admin/parents?show=${filter}&page=${page + 1}`}
              className="bg-card flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
