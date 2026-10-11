import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { loadMyShareLinks, loadPortalReport } from "@/lib/reports/portal-data";
import { isUuid } from "@/lib/setup/structure";
import { ReportView } from "./report-view";
import { ShareLinkMaker, ShareLinkRow } from "./share-panel";

/**
 * One published report for its learner or a parent (US-7.1 to US-7.3;
 * D47): on screen from the snapshot, Download PDF (the stored file through
 * a short signed URL, never made again) and share links. Anything the
 * viewer may not read, a draft included, is not found.
 */
export async function PortalReportPage({
  reportId,
  back,
}: {
  reportId: string;
  back: { href: string; label: string };
}) {
  if (!isUuid(reportId)) notFound();
  const report = await loadPortalReport(reportId);
  if (!report) notFound();
  const links = report.hasPdf ? await loadMyShareLinks(report.id) : [];
  const doc = report.document;

  return (
    <div className="flex flex-col gap-5">
      <Link href={back.href} className="text-muted-foreground w-fit text-sm hover:underline">
        ← {back.label}
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">{doc.learner.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {doc.termName} {doc.year}
        </h1>
      </div>

      {report.hasPdf ? (
        <a
          href={`/reports/${report.id}/pdf?download=1`}
          className={buttonVariants({
            variant: "outline",
            className: "h-12 w-full text-base sm:w-fit sm:px-6",
          })}
        >
          Download PDF
        </a>
      ) : (
        <p role="status" className="text-muted-foreground text-sm">
          The PDF is still being made. Check again shortly.
        </p>
      )}

      <ReportView doc={doc} />

      {report.hasPdf && (
        <section
          aria-labelledby="share"
          className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-xs"
        >
          <div>
            <h2 id="share" className="text-lg font-semibold">
              Share
            </h2>
            <p className="text-muted-foreground text-sm">
              Send a link that opens this report&apos;s PDF without signing in, for 7 days.
            </p>
          </div>
          <ShareLinkMaker
            reportId={report.id}
            term={`${doc.termName} ${doc.year}`}
            school={doc.school.name}
          />
          {links.length > 0 && (
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold">Your active links</h3>
              <ul aria-label="Your active links" className="divide-y">
                {links.map((l) => (
                  <ShareLinkRow
                    key={l.id}
                    reportId={report.id}
                    shareId={l.id}
                    createdAt={l.createdAt}
                    expiresAt={l.expiresAt}
                    opens={l.opens}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
