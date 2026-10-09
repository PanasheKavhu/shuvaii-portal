import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClassSubjectList, TermTabs } from "@/components/marks/class-subject-list";
import { listProgress, requireMarksActor, resolveTerm } from "./data";

export const metadata: Metadata = { title: "Marks" };

/**
 * School admin and head (Q18, US-4.8): every class subject of the term by
 * class, with its teacher and marks progress, each opening the same grid
 * the teacher uses. Teachers have their own list on My classes.
 */
export default async function MarksPage({ searchParams }: PageProps<"/marks">) {
  const actor = await requireMarksActor();
  if (!actor.isAdminOrHead) redirect("/teaching");
  const { term: wanted } = await searchParams;
  const { terms, term } = await resolveTerm(actor.schoolId, wanted);
  const items = term ? await listProgress(term.id) : [];
  const classes = [...new Set(items.map((i) => i.className))];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marks</h1>
        <p className="text-muted-foreground mt-1">
          {term
            ? `Every class subject for ${term.name}. Open one to see or enter its marks; your changes are recorded in the audit log.`
            : "Set up this year's terms in school setup first."}
        </p>
      </div>
      {term && <TermTabs terms={terms} current={term.id} hrefFor={(id) => `/marks?term=${id}`} />}
      {term && items.length === 0 && (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No class subjects this year yet.
        </p>
      )}
      {term &&
        classes.map((className) => (
          <section key={className} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{className}</h2>
            <ClassSubjectList
              items={items.filter((i) => i.className === className)}
              termId={term.id}
              showTeacher
              label={`${className} subjects`}
            />
          </section>
        ))}
    </section>
  );
}
