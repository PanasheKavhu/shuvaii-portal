import type { Metadata } from "next";
import Link from "next/link";
import { BackToOverview, Muted, ProfileSection } from "@/components/oversight/profile-bits";
import { StatusPill } from "@/components/people/status-pill";
import { roleLabel } from "@/lib/auth/roles";
import { count, overallTotals } from "@/lib/marks/completion";
import { resolveTerm } from "../../../../marks/data";
import { requireOverseer } from "../../../oversight-data";
import { loadStaffProfile } from "../../data";

export const metadata: Metadata = { title: "Staff member" };

/**
 * US-9.2: one staff member, read-only. Their class subjects and the classes
 * they are class teacher of this year, and how many marks and comments they
 * still owe this term (completion_class_subjects() and completion_classes(),
 * D36). Admin and head see anyone on the staff; a hod only themselves.
 */
export default async function StaffProfilePage({
  params,
}: PageProps<"/admin/browse/staff/[userId]">) {
  const o = await requireOverseer();
  const { userId } = await params;
  const { term } = await resolveTerm(o.schoolId, undefined);
  const staff = await loadStaffProfile(o, userId, term?.id ?? null);
  const owed = overallTotals(staff.owed.classSubjects, staff.owed.classes);
  const owedSubject = new Map(staff.owed.classSubjects.map((cs) => [cs.classSubjectId, cs]));
  const owedClass = new Map(staff.owed.classes.map((c) => [c.classId, c]));

  return (
    <div className="flex flex-col gap-5">
      <BackToOverview />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{staff.name}</h1>
        {staff.email && <p className="text-muted-foreground mt-1 break-words">{staff.email}</p>}
        {staff.roles.length > 0 && (
          <ul aria-label="Roles" className="mt-2 flex flex-wrap gap-2">
            {staff.roles.map((r) => (
              <li key={r.role}>
                <StatusPill tone={r.status === "active" ? "neutral" : "muted"}>
                  {roleLabel(r.role)}
                  {r.status !== "active" && ` (${r.status})`}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
        {o.isAdmin && (
          <Link
            href={`/admin/people/staff/${staff.id}`}
            className="text-primary mt-1 flex min-h-11 w-fit items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            Edit in People
          </Link>
        )}
      </div>

      {term && (
        <ProfileSection id="owed" title={`Still to do in ${term.name}`}>
          <p data-testid="owed-summary">
            {count(owed.marksMissing, "mark")}, {count(owed.commentsMissing, "subject comment")}
            {term.kind !== "vacation" &&
              `, ${count(owed.classCommentsMissing, "class comment")}`}{" "}
            missing.
          </p>
        </ProfileSection>
      )}

      <ProfileSection id="class-subjects" title="Class subjects this year">
        {staff.classSubjects.length === 0 ? (
          <Muted>None.</Muted>
        ) : (
          <ul className="flex flex-col divide-y">
            {staff.classSubjects.map((cs) => {
              const o2 = owedSubject.get(cs.id);
              const gaps = o2
                ? [
                    o2.marksMissing > 0 && count(o2.marksMissing, "mark"),
                    o2.commentsMissing > 0 && count(o2.commentsMissing, "comment"),
                  ].filter(Boolean)
                : [];
              return (
                <li key={cs.id}>
                  <Link
                    href={
                      term ? `/marks/${cs.id}/${term.id}` : `/admin/browse/classes/${cs.classId}`
                    }
                    className="hover:bg-muted/40 -mx-2 flex min-h-12 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1"
                  >
                    <span className="text-primary font-medium">
                      {cs.className} {cs.subjectName}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {gaps.length ? `${gaps.join(" · ")} missing` : "Nothing missing"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ProfileSection>

      <ProfileSection id="classes" title="Class teacher of">
        {staff.classes.length === 0 ? (
          <Muted>No class this year.</Muted>
        ) : (
          <ul className="flex flex-col divide-y">
            {staff.classes.map((c) => {
              const missing = owedClass.get(c.id)?.classCommentsMissing ?? null;
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/browse/classes/${c.id}`}
                    className="hover:bg-muted/40 -mx-2 flex min-h-12 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1"
                  >
                    <span className="text-primary font-medium">{c.name}</span>
                    {missing !== null && (
                      <span className="text-muted-foreground text-sm">
                        {missing > 0
                          ? `${count(missing, "class comment")} missing`
                          : "Class comments complete"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ProfileSection>
    </div>
  );
}
