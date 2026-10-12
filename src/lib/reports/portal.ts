/**
 * The learner and parent portal (SPEC E7; D47). Pure: the pages load the
 * rows and pass them in.
 */

/** One published report as `portal_reports()` lists it, newest first. */
export type PortalReport = {
  report_id: string;
  learner_id: string;
  is_own: boolean;
  learner_name: string | null;
  class_name: string | null;
  year_label: string | null;
  term_name: string | null;
  version: number;
  published_at: string | null;
  has_pdf: boolean;
};

export type PortalChild = { learner_id: string; first_name: string; last_name: string };

/**
 * Reports by year (US-7.5), keeping the order they came in: newest year,
 * then newest term, first.
 */
export function groupByYear<T extends Pick<PortalReport, "year_label">>(
  reports: readonly T[],
): { year: string; reports: T[] }[] {
  const groups: { year: string; reports: T[] }[] = [];
  for (const report of reports) {
    const year = report.year_label ?? "";
    const last = groups.at(-1);
    if (last && last.year === year) last.reports.push(report);
    else groups.push({ year, reports: [report] });
  }
  return groups;
}

/** A year the learner is (or was) enrolled in, as `family_enrolment_years()` lists it. */
export type EnrolmentYear = { year_label: string; class_name: string };

/**
 * Reports by year with every enrolment year shown, newest first (US-3.5,
 * D53): a year with no published report yet (the new year after a
 * rollover) is a group with no reports and its class, next to the years
 * that have them. Years only the reports know keep their place after.
 */
export function yearGroupsWithEmpty<T extends Pick<PortalReport, "year_label">>(
  reports: readonly T[],
  years: readonly EnrolmentYear[],
): { year: string; className: string | null; reports: T[] }[] {
  const groups = groupByYear(reports);
  const byYear = new Map(groups.map((g) => [g.year, g]));
  const out: { year: string; className: string | null; reports: T[] }[] = [];
  const seen = new Set<string>();
  for (const y of years) {
    if (seen.has(y.year_label)) continue;
    seen.add(y.year_label);
    out.push({
      year: y.year_label,
      className: y.class_name,
      reports: byYear.get(y.year_label)?.reports ?? [],
    });
  }
  for (const g of groups) if (!seen.has(g.year)) out.push({ ...g, className: null });
  return out;
}

/** The child the parent asked for (`?child=`), else the first. Null with no children. */
export function pickChild<T extends { learner_id: string }>(
  children: readonly T[],
  requested: string | string[] | undefined,
): T | null {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return children.find((c) => c.learner_id === id) ?? children[0] ?? null;
}

/** Share link tokens: 32 random bytes in base64url, made by the database (D47). */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isShareToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/** The link a family member sends: `<portal>/s/<token>`. */
export function shareLinkUrl(portalUrl: string, token: string): string {
  return `${portalUrl.replace(/\/+$/, "")}/s/${token}`;
}

/**
 * A WhatsApp "click to chat" link with the message filled in; the sender
 * picks who gets it. Names the term and school, not the learner.
 */
export function whatsAppShareUrl(link: string, what: { term: string; school: string }): string {
  const text = `${what.term} school report from ${what.school}: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens per network address before the share page asks them to wait. */
export const SHARE_OPEN_LIMIT = 20;
export const SHARE_OPEN_WINDOW_MS = 10 * 60 * 1000;

/** The downloaded file's name: the report's reference, no personal data. */
export function reportFileName(referenceCode: string | null): string {
  return referenceCode ? `report-${referenceCode}.pdf` : "report.pdf";
}

/** "Expires 18 Oct" style dates for share links, in the school's time zone. */
export function shortDate(iso: string, timeZone = "Africa/Harare"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(
    date,
  );
}
