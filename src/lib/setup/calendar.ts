/**
 * Academic year and term checks and proposed defaults for the setup wizard
 * (SPEC US-2.1, US-2.4). Pure. Dates are ISO `YYYY-MM-DD` strings, which
 * compare correctly as text.
 */

export const TERM_KINDS = ["term", "vacation", "mock"] as const;
export type TermKind = (typeof TERM_KINDS)[number];
export const TERM_KIND_LABELS: Record<TermKind, string> = {
  term: "Term",
  vacation: "Vacation school",
  mock: "Mock exams",
};

export const TERM_STATUSES = ["planned", "open", "locked", "closed"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];
export const TERM_STATUS_LABELS: Record<TermStatus, string> = {
  planned: "Planned",
  open: "Open for marks",
  locked: "Locked",
  closed: "Closed",
};

export type YearDraft = { label: string; startsOn: string; endsOn: string };
export type TermDraft = {
  name: string;
  kind: TermKind;
  startsOn: string;
  endsOn: string;
  marksDeadline: string | null;
  status: TermStatus;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTermKind(value: unknown): value is TermKind {
  return typeof value === "string" && (TERM_KINDS as readonly string[]).includes(value);
}

export function isTermStatus(value: unknown): value is TermStatus {
  return typeof value === "string" && (TERM_STATUSES as readonly string[]).includes(value);
}

/**
 * The label for the next year to set up: one after the latest numeric label,
 * or the calendar year of `today` when there is none.
 */
export function nextYearLabel(existing: readonly string[], today: Date): string {
  const years = existing.map((l) => Number(l)).filter((n) => Number.isInteger(n) && n > 1900);
  return String(years.length ? Math.max(...years) + 1 : today.getUTCFullYear());
}

/**
 * Proposed calendar for a year: three terms plus the April vacation school,
 * on the seed's (invented, Q23) dates, each still planned. Marks are due two
 * weeks before a term ends and three days after vacation school. The admin
 * edits all of it.
 */
export function proposeCalendar(label: string): { year: YearDraft; terms: TermDraft[] } {
  const y = /^\d{4}$/.test(label.trim()) ? label.trim() : String(new Date().getUTCFullYear());
  const term = (name: string, kind: TermKind, s: string, e: string, d: string): TermDraft => ({
    name,
    kind,
    startsOn: `${y}-${s}`,
    endsOn: `${y}-${e}`,
    marksDeadline: `${y}-${d}`,
    status: "planned",
  });
  return {
    year: { label: y, startsOn: `${y}-01-13`, endsOn: `${y}-12-04` },
    terms: [
      term(`Term 1 ${y}`, "term", "01-13", "04-09", "03-26"),
      term(`April ${y} Vacation School`, "vacation", "04-14", "04-24", "04-27"),
      term(`Term 2 ${y}`, "term", "05-05", "08-07", "07-24"),
      term(`Term 3 ${y}`, "term", "09-08", "12-04", "11-20"),
    ],
  };
}

type Errors<T> = Partial<Record<keyof T, string>>;
export type Parse<T> = { ok: true; value: T } | { ok: false; errors: Errors<T> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function parseYear(form: {
  label: unknown;
  startsOn: unknown;
  endsOn: unknown;
}): Parse<YearDraft> {
  const label = text(form.label);
  const errors: Errors<YearDraft> = {};
  if (label.length < 1 || label.length > 20)
    errors.label = "Enter a label such as 2027 (up to 20 characters).";
  if (!isIsoDate(form.startsOn)) errors.startsOn = "Enter the first day of the year.";
  if (!isIsoDate(form.endsOn)) errors.endsOn = "Enter the last day of the year.";
  else if (isIsoDate(form.startsOn) && form.endsOn <= form.startsOn)
    errors.endsOn = "The year must end after it starts.";
  if (Object.keys(errors).length || !isIsoDate(form.startsOn) || !isIsoDate(form.endsOn))
    return { ok: false, errors };
  return { ok: true, value: { label, startsOn: form.startsOn, endsOn: form.endsOn } };
}

/** One term or vacation period, checked on its own and against its year. */
export function parseTerm(
  form: {
    name: unknown;
    kind: unknown;
    startsOn: unknown;
    endsOn: unknown;
    marksDeadline: unknown;
    status: unknown;
  },
  year?: { startsOn: string; endsOn: string },
): Parse<TermDraft> {
  const name = text(form.name);
  const deadline = text(form.marksDeadline);
  const errors: Errors<TermDraft> = {};

  if (name.length < 1 || name.length > 60) errors.name = "Enter a name (up to 60 characters).";
  if (!isTermKind(form.kind)) errors.kind = "Choose term, vacation school or mock exams.";
  if (!isTermStatus(form.status)) errors.status = "Choose a status.";
  const starts = isIsoDate(form.startsOn) ? form.startsOn : null;
  const ends = isIsoDate(form.endsOn) ? form.endsOn : null;
  if (!starts) errors.startsOn = "Enter the start date.";
  if (!ends) errors.endsOn = "Enter the end date.";
  if (starts && ends) {
    if (ends < starts) errors.endsOn = "The end date is before the start date.";
    else if (year && (starts < year.startsOn || ends > year.endsOn))
      errors.startsOn = `Keep the dates inside the year (${year.startsOn} to ${year.endsOn}).`;
  }
  if (deadline && !isIsoDate(deadline))
    errors.marksDeadline = "Enter a valid date or leave it empty.";
  else if (deadline && starts && deadline < starts)
    errors.marksDeadline = "The marks deadline cannot be before the start date.";

  if (
    Object.keys(errors).length ||
    !starts ||
    !ends ||
    !isTermKind(form.kind) ||
    !isTermStatus(form.status)
  )
    return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      kind: form.kind,
      startsOn: starts,
      endsOn: ends,
      marksDeadline: deadline || null,
      status: form.status,
    },
  };
}

export type TermClash = { first: string; second: string };

/** Pairs of periods in a year whose dates overlap, and names used twice. */
export function termClashes(terms: readonly Pick<TermDraft, "name" | "startsOn" | "endsOn">[]): {
  overlaps: TermClash[];
  duplicateNames: string[];
} {
  const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const overlaps: TermClash[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j]!.startsOn > sorted[i]!.endsOn) break;
      overlaps.push({ first: sorted[i]!.name, second: sorted[j]!.name });
    }
  }
  const counts = new Map<string, number>();
  for (const t of terms)
    counts.set(t.name.toLowerCase(), (counts.get(t.name.toLowerCase()) ?? 0) + 1);
  const duplicateNames = terms
    .filter(
      (t, i) =>
        counts.get(t.name.toLowerCase())! > 1 &&
        terms.findIndex((u) => u.name.toLowerCase() === t.name.toLowerCase()) === i,
    )
    .map((t) => t.name);
  return { overlaps, duplicateNames };
}
