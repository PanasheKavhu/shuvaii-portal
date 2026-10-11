import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyReport } from "@/lib/reports/verify-lookup";
import { NOT_FOUND, WITHDRAWN, normalizeVerificationCode } from "@/lib/reports/verify";

export const metadata: Metadata = {
  title: "Check a report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * US-6.5 (D45): the page a report's QR code opens. Public, no sign in. It
 * shows only the reference, learner name, school, term and status. A
 * withdrawn report says it is withdrawn and no longer valid (US-6.6, D46);
 * an unknown code shows "not found". Lookups are limited per network
 * address.
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
                <h1>{outcome.report.withdrawn ? WITHDRAWN : "Report verified"}</h1>
              </CardTitle>
              <CardDescription role={outcome.report.withdrawn ? "alert" : undefined}>
                {outcome.report.withdrawn
                  ? "The school withdrew this report and issued a corrected version. Do not rely on this one; ask the school or the family for the current report."
                  : "This report was issued through SP Portal. Check the details match the paper or PDF in front of you."}
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
                  ? NOT_FOUND
                  : outcome.kind === "limited"
                    ? "Too many checks"
                    : "Cannot check right now"}
              </h1>
            </CardTitle>
            <CardDescription role={outcome.kind === "not-found" ? undefined : "alert"}>
              {outcome.kind === "not-found"
                ? "No report has this code. It may have been typed wrongly; check it against the paper or ask the school."
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
