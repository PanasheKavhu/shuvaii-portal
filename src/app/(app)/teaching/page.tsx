import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ClassSubjectList, TermTabs } from "@/components/marks/class-subject-list";
import { requireArea } from "@/lib/auth/viewer";
import { listClassesForTerm } from "../marks/comment-data";
import { listProgress, requireMarksActor, resolveTerm } from "../marks/data";

export const metadata: Metadata = { title: "My classes" };

/**
 * A teacher's home (US-4.2): the class subjects they teach this term, with
 * marks progress, each opening its marks grid; the classes they are class
 * teacher of, each opening its results and comments (US-5.3); and their
 * comment bank (US-5.2).
 */
export default async function TeachingPage({ searchParams }: PageProps<"/teaching">) {
  const { viewer, school } = await requireArea("teaching");
  const actor = await requireMarksActor("teaching");
  const { term: wanted } = await searchParams;
  const { terms, term } = await resolveTerm(actor.schoolId, wanted);
  const [progress, myClasses] = term
    ? await Promise.all([listProgress(term.id), listClassesForTerm(actor, term.id, true)])
    : [[], []];
  const mine = progress.filter((cs) => cs.teacherId === actor.userId);
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
      {term && myClasses.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Class teacher</h2>
          <ul aria-label="My classes as class teacher" className="grid gap-3 sm:grid-cols-2">
            {myClasses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/marks/classes/${c.id}/${term.id}`}
                  className="bg-card hover:border-primary/60 flex min-h-14 flex-col justify-center rounded-2xl border p-4 shadow-xs"
                >
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted-foreground text-sm">Results and class comments</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link
        href="/teaching/comment-bank"
        className="bg-card hover:border-primary/60 flex min-h-12 w-fit items-center rounded-lg border px-4 font-medium"
      >
        My comment bank
      </Link>
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
