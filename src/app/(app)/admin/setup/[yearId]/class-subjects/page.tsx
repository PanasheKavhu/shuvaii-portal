import type { Metadata } from "next";
import Link from "next/link";
import { NextStep } from "@/components/setup/step-nav";
import {
  getYear,
  listClassSubjects,
  listClasses,
  listSubjects,
  listTeachers,
  requireSchoolAdmin,
} from "../../data";

export const metadata: Metadata = { title: "Class subjects" };

/**
 * US-2.2 overview: each class with how many of its subjects have a teacher,
 * and each teacher's load across classes and grades.
 */
export default async function ClassSubjectsOverview({
  params,
}: PageProps<"/admin/setup/[yearId]/class-subjects">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);
  const [classes, subjects, teachers] = await Promise.all([
    listClasses(year.id),
    listSubjects(schoolId),
    listTeachers(schoolId),
  ]);
  const rows = await listClassSubjects(classes.map((c) => c.id));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const load = teachers
    .map((t) => ({
      teacher: t,
      items: rows
        .filter((r) => r.teacherId === t.id)
        .map((r) => `${subjectName.get(r.subjectId)} (${className.get(r.classId)})`)
        .sort(),
    }))
    .filter((l) => l.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {classes.length === 0 ? (
        <p className="bg-muted/40 rounded-xl border border-dashed p-4">
          Add classes first, then choose the subjects each one takes.
        </p>
      ) : (
        <ul aria-label="Classes" className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => {
            const own = rows.filter((r) => r.classId === c.id);
            const missing = own.filter((r) => !r.teacherId).length;
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/setup/${year.id}/classes/${c.id}`}
                  className="bg-card hover:bg-muted/60 flex min-h-16 flex-col justify-center gap-1 rounded-2xl border p-4"
                >
                  <span className="font-semibold">{c.name}</span>
                  <span
                    className={
                      missing || own.length === 0
                        ? "text-destructive text-sm font-medium"
                        : "text-muted-foreground text-sm"
                    }
                  >
                    {own.length === 0
                      ? "No subjects yet"
                      : `${own.length} subject${own.length === 1 ? "" : "s"}` +
                        (missing ? `, ${missing} without a teacher` : ", all have a teacher")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {load.length > 0 && (
        <section aria-labelledby="load-heading" className="flex flex-col gap-3">
          <h2 id="load-heading" className="font-semibold">
            Who teaches what
          </h2>
          <ul className="flex flex-col gap-2">
            {load.map(({ teacher, items }) => (
              <li key={teacher.id} className="bg-card rounded-xl border p-3 text-sm">
                <span className="font-medium">
                  {teacher.name}
                  {teacher.isHod && " (HOD)"}
                </span>
                <span className="text-muted-foreground">: {items.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NextStep yearId={year.id} after="/class-subjects" />
    </div>
  );
}
