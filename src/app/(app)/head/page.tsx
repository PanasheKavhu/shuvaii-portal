import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { TermTabs } from "@/components/marks/class-subject-list";
import { getActiveSchool, requireArea } from "@/lib/auth/viewer";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { resolveTerm } from "../marks/data";

export const metadata: Metadata = { title: "Head's office" };

/**
 * The head's reports (US-6.2, US-6.3; D44): each class of the term with
 * how many of its reports wait for the head, are approved or published,
 * each opening the class's reports to check, comment on, approve, return
 * or publish.
 */
export default async function HeadPage({ searchParams }: PageProps<"/head">) {
  const { viewer, school } = await requireArea("head");
  const active = school ?? (await getActiveSchool(viewer));
  if (!active) forbidden();
  const { term: wanted } = await searchParams;
  const { terms, term } = await resolveTerm(active.schoolId, wanted);
  const supabase = await createClient();
  const classes = term
    ? rowsOrThrow(
        await supabase.rpc("report_class_overview", { p_term_id: term.id }),
        "reports",
        "Could not load the reports. Please try again.",
      )
    : [];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-muted-foreground text-sm">{active.schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Head&apos;s office</h1>
        <p className="text-muted-foreground mt-1">
          {term
            ? `Reports for ${term.name}. Class teachers submit their class's reports; you check them, add your comment, then approve or return them, and publish.`
            : "Set up this year's terms in school setup first."}
        </p>
      </div>
      {term && <TermTabs terms={terms} current={term.id} hrefFor={(id) => `/head?term=${id}`} />}
      {term && classes.length === 0 && (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No classes this year yet.
        </p>
      )}
      {term && classes.length > 0 && (
        <ul aria-label="Classes" className="grid gap-3 md:grid-cols-2">
          {classes.map((c) => {
            const waiting = c.submitted;
            const parts = [
              waiting ? `${waiting} waiting for you` : null,
              c.approved ? `${c.approved} approved` : null,
              c.published ? `${c.published} published` : null,
              c.drafts ? `${c.drafts} with the class teacher` : null,
            ].filter(Boolean);
            return (
              <li key={c.class_id}>
                <Link
                  href={`/head/reports/${c.class_id}/${term.id}`}
                  className="bg-card hover:bg-muted/40 flex min-h-20 flex-col gap-1 rounded-2xl border p-4 shadow-xs"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold">{c.class_name}</span>
                    {waiting > 0 && (
                      <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        {waiting} to check
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {c.class_teacher_name ?? "No class teacher"} · {c.learners}{" "}
                    {c.learners === 1 ? "learner" : "learners"}
                  </span>
                  <span className="text-sm">
                    {parts.length ? parts.join(", ") : "No reports yet"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
