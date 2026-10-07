import type { Metadata } from "next";
import Link from "next/link";
import { roleLabel } from "@/lib/auth/roles";
import { getActiveSchool, requireViewer } from "@/lib/auth/viewer";
import { chooseSchool } from "../actions";

export const metadata: Metadata = { title: "Choose a school" };

/** School picker for people with memberships in more than one school (US-1.1). */
export default async function SelectSchoolPage() {
  const viewer = await requireViewer();
  const current = await getActiveSchool(viewer);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a school</h1>
        <p className="text-muted-foreground">You can switch school at any time from the top bar.</p>
      </div>
      {viewer.schools.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6">
          Your account is not linked to an active school.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {viewer.schools.map((school) => (
            <li key={school.schoolId}>
              <form action={chooseSchool}>
                <input type="hidden" name="schoolId" value={school.schoolId} />
                <button
                  type="submit"
                  className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-16 w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3"
                >
                  <span className="text-base font-semibold">{school.schoolName}</span>
                  <span className="text-muted-foreground text-sm">
                    {school.roles.map(roleLabel).join(", ")}
                    {current?.schoolId === school.schoolId && viewer.schools.length > 1
                      ? " · current"
                      : ""}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {viewer.isPlatformAdmin && (
        <Link
          href="/platform"
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Go to the platform console
        </Link>
      )}
    </section>
  );
}
