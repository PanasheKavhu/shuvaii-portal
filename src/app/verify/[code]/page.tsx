import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyReport } from "@/lib/reports/verify-lookup";
import { NOT_FOUND_OR_WITHDRAWN, normalizeVerificationCode } from "@/lib/reports/verify";

export const metadata: Metadata = {
  title: "Check a report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * US-6.5 (D45): the page a report's QR code opens. Public, no sign in. It
 * shows only the reference, learner name, school, term and status; an
 * unknown or withdrawn code shows "not found or withdrawn". Lookups are
 * limited per network address.
 */
export default async function VerifyReportPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const outcome = await verifyReport(normalizeVerificationCode(code));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        {outcome.kind === "found" ? (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                <h1>Report verified</h1>
              </CardTitle>
              <CardDescription>
                This report was issued through SP Portal. Check the details match the paper or PDF
                in front of you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl aria-label="Report details" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
                {(
                  [
                    ["Reference", outcome.report.reference],
                    ["Learner", outcome.report.learnerName],
                    ["School", outcome.report.schoolName],
                    ["Term", outcome.report.termName],
                    ["Status", outcome.report.status],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground text-sm">{label}</dt>
                    <dd className="font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </>
        ) : (
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              <h1>
                {outcome.kind === "not-found"
                  ? NOT_FOUND_OR_WITHDRAWN
                  : outcome.kind === "limited"
                    ? "Too many checks"
                    : "Cannot check right now"}
              </h1>
            </CardTitle>
            <CardDescription role={outcome.kind === "not-found" ? undefined : "alert"}>
              {outcome.kind === "not-found"
                ? "No current report has this code. It may have been typed wrongly, or the school withdrew the report. Ask the school for the current version."
                : outcome.kind === "limited"
                  ? `Too many reports were checked from your network. Try again in ${outcome.minutes} minute${outcome.minutes === 1 ? "" : "s"}.`
                  : "Please try again shortly."}
            </CardDescription>
          </CardHeader>
        )}
      </Card>
    </main>
  );
}
