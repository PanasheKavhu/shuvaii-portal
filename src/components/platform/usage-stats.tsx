import { ago, formatBytes, totalBytes, type SchoolUsage } from "@/lib/platform/usage";

/**
 * A school's headline usage numbers (US-10.4): counts, storage and last
 * activity. Numbers only (D5, D17).
 */
export function UsageStats({
  usage,
  now,
  detailed = false,
}: {
  usage: SchoolUsage;
  now: Date;
  /** The school page also shows storage per bucket and both activity times. */
  detailed?: boolean;
}) {
  const stats: [string, string][] = [
    ["Learners", String(usage.activeLearners)],
    ["Staff", String(usage.activeStaff)],
    ["Parents", String(usage.activeParents)],
    ["Published reports", String(usage.publishedReports)],
    ["Storage", formatBytes(totalBytes(usage))],
  ];
  if (detailed) {
    stats.push(
      ["Last sign in", ago(usage.lastSignInAt, now)],
      ["Last marks entry", ago(usage.lastMarksAt, now)],
      ["Reports storage", formatBytes(usage.bytes.reports)],
      ["Attachments storage", formatBytes(usage.bytes.attachments)],
      ["Imports storage", formatBytes(usage.bytes.imports)],
      ["Branding storage", formatBytes(usage.bytes.branding)],
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map(([label, value]) => (
        <div key={label} className="bg-muted/40 flex flex-col rounded-xl border px-3 py-2">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
