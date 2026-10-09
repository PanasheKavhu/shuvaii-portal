import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClassSubjectList, TermTabs } from "@/components/marks/class-subject-list";
import { requireArea } from "@/lib/auth/viewer";
import { listProgress, requireMarksActor, resolveTerm } from "../marks/data";

export const metadata: Metadata = { title: "My classes" };

/**
 * A teacher's home (US-4.2): the class subjects they teach this term, with
 * marks progress, each opening its marks grid.
 */
export default async function TeachingPage({ searchParams }: PageProps<"/teaching">) {
  const { viewer, school } = await requireArea("teaching");
  const actor = await requireMarksActor("teaching");
  const { term: wanted } = await searchParams;
  const { terms, term } = await resolveTerm(actor.schoolId, wanted);
  const mine = term
    ? (await listProgress(term.id)).filter((cs) => cs.teacherId === actor.userId)
    : [];
  const firstName = viewer.fullName.split(" ")[0];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-muted-foreground text-sm">{school?.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">My classes</h1>
        <p className="text-muted-foreground mt-1">
          {firstName ? `Welcome, ${firstName}. ` : ""}
          {term ? `Marks for ${term.name}.` : ""}
        </p>
      </div>
      {term && (
        <TermTabs terms={terms} current={term.id} hrefFor={(id) => `/teaching?term=${id}`} />
      )}
      {!term ? (
        <EmptyNote>Your school has not set up this year&apos;s terms yet.</EmptyNote>
      ) : mine.length === 0 ? (
        <EmptyNote>
          You have no class subjects this year. Your school admin assigns them in school setup.
        </EmptyNote>
      ) : (
        <ClassSubjectList items={mine} termId={term.id} label="My class subjects" />
      )}
    </section>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
      {children}
    </p>
  );
}
