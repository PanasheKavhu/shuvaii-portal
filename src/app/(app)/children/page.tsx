import type { Metadata } from "next";
import Link from "next/link";
import { LatestNews } from "@/components/news/latest-news";
import { PortalHeading } from "@/components/portal/portal-heading";
import { ReportList } from "@/components/portal/report-list";
import { requireArea } from "@/lib/auth/viewer";
import { pickChild } from "@/lib/reports/portal";
import { loadFamilyYears, loadPortalReports } from "@/lib/reports/portal-data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadNewsSummary } from "../news/data";

export const metadata: Metadata = { title: "My children" };

/**
 * Parent home (US-7.1, US-7.4, US-7.5; D47): the linked children with a
 * one-tap switcher, and the chosen child's published reports by year and
 * term, newest first. A child who has left the school keeps their reports
 * here, and a new year shows with its class before any report (D53). Primary learners have no login (D26), so this is where their
 * reports reach the family.
 */
export default async function ChildrenPage({ searchParams }: PageProps<"/children">) {
  const { viewer, school } = await requireArea("children");
  const supabase = await createClient();
  const [{ data: children, error }, reports, years, { child }, news] = await Promise.all([
    school
      ? supabase.rpc("my_children", { p_school_id: school.schoolId })
      : Promise.resolve({ data: [], error: null }),
    school ? loadPortalReports(school.schoolId) : Promise.resolve([]),
    school ? loadFamilyYears(school.schoolId) : Promise.resolve([]),
    searchParams,
    school?.features.newsletter ? loadNewsSummary(supabase, school.schoolId) : null,
  ]);
  if (error) throw new Error("Could not load your children");
  const chosen = pickChild(children, child);

  return (
    <section className="flex flex-col gap-5">
      <PortalHeading
        schoolName={school?.schoolName}
        title="My children"
        fullName={viewer.fullName}
      />
      {news && <LatestNews summary={news} />}

      {children.length > 0 && (
        <nav aria-label="Children">
          <ul aria-label="Your children" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {children.map((c) => {
              const active = c.learner_id === chosen?.learner_id;
              return (
                <li key={c.learner_id} className="shrink-0">
                  <Link
                    href={`/children?child=${c.learner_id}`}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex min-h-12 items-center rounded-full border px-5 text-base font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {c.first_name} {c.last_name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {chosen ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Reports for {chosen.first_name} {chosen.last_name}
          </h2>
          <ReportList
            reports={reports.filter((r) => r.learner_id === chosen.learner_id)}
            years={years.filter((y) => y.learner_id === chosen.learner_id)}
            hrefFor={(id) => `/children/reports/${id}`}
            emptyText={`No published reports for ${chosen.first_name} yet. They appear here once the school publishes them.`}
          />
        </div>
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          No children are linked to your account yet. Ask the school for a parent code.
        </p>
      )}
    </section>
  );
}
