import Link from "next/link";
import { printedDate } from "@/lib/reports/document";
import { yearGroupsWithEmpty, type EnrolmentYear, type PortalReport } from "@/lib/reports/portal";

/**
 * Published reports by year and term, newest first, earlier years included
 * (US-7.1, US-7.5; D47). Each opens on screen. A year the learner is
 * enrolled in with nothing published yet (a new year after the rollover)
 * shows its class and "No reports yet" (US-3.5, D52).
 */
export function ReportList({
  reports,
  years = [],
  hrefFor,
  emptyText,
}: {
  reports: readonly PortalReport[];
  years?: readonly EnrolmentYear[];
  hrefFor: (reportId: string) => string;
  emptyText: string;
}) {
  if (reports.length === 0 && years.length <= 1) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {yearGroupsWithEmpty(reports, years).map((group) => (
        <section
          key={group.year}
          aria-labelledby={`year-${group.year}`}
          className="flex flex-col gap-2"
        >
          <h2
            id={`year-${group.year}`}
            className="text-muted-foreground text-sm font-semibold tracking-wide"
          >
            {group.year}
            {group.className && ` · ${group.className}`}
          </h2>
          {group.reports.length === 0 && (
            <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
              No reports yet for {group.year}. They appear here once the school publishes them.
            </p>
          )}
          {group.reports.length > 0 && (
            <ul aria-label={`Reports for ${group.year}`} className="flex flex-col gap-2">
              {group.reports.map((r) => (
                <li key={r.report_id}>
                  <Link
                    href={hrefFor(r.report_id)}
                    className="bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xs outline-none focus-visible:ring-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">{r.term_name}</span>
                      <span className="text-muted-foreground text-sm">
                        {r.class_name}
                        {r.published_at && ` · Published ${printedDate(r.published_at)}`}
                        {r.version > 1 && " · Amended"}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted-foreground text-xl">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
