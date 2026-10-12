import { roleLabel, type AppRole } from "@/lib/auth/roles";

/**
 * The school admin's and head's overview and browse pages (US-9.1, US-9.2;
 * D51). Pure: the callers pass rows the oversight functions and RLS already
 * returned, and nothing here works out a mark, grade or position; it only
 * adds up counts and shapes rows for the screens.
 */

// Reports by status ----------------------------------------------------------------

export const REPORT_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "published",
  "withdrawn",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Drafts",
  submitted: "Submitted",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export type ReportCounts = Record<ReportStatus, number>;

export type ClassReportStatus = {
  classId: string;
  className: string;
  classTeacherName: string | null;
  counts: ReportCounts;
  /** Drafts the head sent back; also counted in `draft`. */
  returned: number;
};

export const noReports = (): ReportCounts => ({
  draft: 0,
  submitted: 0,
  approved: 0,
  published: 0,
  withdrawn: 0,
});

/** The whole school's reports by status, from the per-class rows. */
export function reportTotals(rows: readonly ClassReportStatus[]): ReportCounts {
  const totals = noReports();
  for (const row of rows) for (const s of REPORT_STATUSES) totals[s] += row.counts[s];
  return totals;
}

/** Report versions by status, from report rows a page could read (a class's reports). */
export function countReports(rows: readonly { status: string }[]): ReportCounts {
  const counts = noReports();
  for (const r of rows)
    if ((REPORT_STATUSES as readonly string[]).includes(r.status))
      counts[r.status as ReportStatus]++;
  return counts;
}

export const totalReports = (c: ReportCounts) => REPORT_STATUSES.reduce((n, s) => n + c[s], 0);

/** "2 published, 1 withdrawn", or "No reports yet". */
export function describeReports(c: ReportCounts): string {
  const parts = REPORT_STATUSES.filter((s) => c[s] > 0).map(
    (s) => `${c[s]} ${REPORT_STATUS_LABELS[s].toLowerCase()}`,
  );
  return parts.length ? parts.join(", ") : "No reports yet";
}

// Search ---------------------------------------------------------------------------

export const SEARCH_MAX = 100;

/** The search box's text as sent: spaces joined, at most 100 characters; "" when blank. */
export function cleanSearch(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX) : "";
}

export type SearchKind = "learner" | "staff" | "class";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  label: string;
  detail: string | null;
  roles: AppRole[];
};

export type SearchResults = { learners: SearchHit[]; staff: SearchHit[]; classes: SearchHit[] };

const KINDS: readonly SearchKind[] = ["learner", "staff", "class"];

/** browse_search() rows, grouped for the screen; rows of an unknown kind are dropped. */
export function groupHits(
  rows: readonly {
    kind: string;
    id: string;
    label: string;
    detail: string | null;
    roles: string[] | null;
  }[],
): SearchResults {
  const out: SearchResults = { learners: [], staff: [], classes: [] };
  for (const r of rows) {
    if (!(KINDS as readonly string[]).includes(r.kind)) continue;
    const hit: SearchHit = {
      kind: r.kind as SearchKind,
      id: r.id,
      label: r.label,
      detail: r.detail,
      roles: (r.roles ?? []) as AppRole[],
    };
    if (hit.kind === "learner") out.learners.push(hit);
    else if (hit.kind === "staff") out.staff.push(hit);
    else out.classes.push(hit);
  }
  return out;
}

export const hitCount = (r: SearchResults) => r.learners.length + r.staff.length + r.classes.length;

/** The read-only profile a result opens. */
export function hrefForHit(hit: Pick<SearchHit, "kind" | "id">): string {
  const base = { learner: "learners", staff: "staff", class: "classes" }[hit.kind];
  return `/admin/browse/${base}/${hit.id}`;
}

/** "Teacher, Head of department". */
export const rolesText = (roles: readonly AppRole[]) => roles.map(roleLabel).join(", ");

// Guardians list ------------------------------------------------------------------------

export const GUARDIAN_FILTERS = ["never", "linked"] as const;
export type GuardianFilter = (typeof GUARDIAN_FILTERS)[number];

export const GUARDIAN_PAGE_SIZE = 100;

export function parseGuardianFilter(value: unknown): GuardianFilter {
  return value === "linked" ? "linked" : "never";
}

/** A 1-based page number from the address; anything odd is page 1. */
export function parsePage(value: unknown): number {
  const n = typeof value === "string" && /^\d{1,5}$/.test(value) ? Number(value) : 1;
  return n >= 1 ? n : 1;
}
