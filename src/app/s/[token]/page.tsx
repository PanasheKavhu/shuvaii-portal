import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openShareLink } from "@/lib/reports/share-open";

export const metadata: Metadata = {
  title: "Shared report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * US-7.3 (D47): a share link opens the report's stored PDF with no sign in
 * for 7 days, through a 60-second signed URL. A revoked, expired or
 * withdrawn link, or an unknown one, says the same thing. Opens are limited
 * per network address and logged without personal data.
 */
export default async function SharedReportPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const outcome = await openShareLink(token);
  if (outcome.kind === "open") redirect(outcome.url);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>
              {outcome.kind === "gone"
                ? "This link no longer works"
                : outcome.kind === "limited"
                  ? "Too many reports opened"
                  : "Cannot open the report right now"}
            </h1>
          </CardTitle>
          <CardDescription role="alert">
            {outcome.kind === "gone"
              ? "Share links last 7 days and can be turned off by the family or when the school replaces the report. Ask whoever sent it for a new link."
              : outcome.kind === "limited"
                ? `Too many shared reports were opened from your network. Try again in ${outcome.minutes} minute${outcome.minutes === 1 ? "" : "s"}.`
                : "Please try again shortly."}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
