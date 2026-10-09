/**
 * Which term the marks screens open on, progress figures and the lock
 * notice text (US-4.2, US-4.5, US-4.8). Pure.
 */

export type TermLike = { id: string; startsOn: string; endsOn: string; kind: string };

/** Today's date (YYYY-MM-DD) in a time zone such as Africa/Harare. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The current term of a year's terms: the one whose dates include today
 * (a term before a vacation period if both do), else the latest one that
 * has started, else the first. Null when there are no terms.
 */
export function pickCurrentTerm<T extends TermLike>(terms: readonly T[], today: string): T | null {
  const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const running = sorted.filter((t) => t.startsOn <= today && today <= t.endsOn);
  if (running.length) return running.find((t) => t.kind !== "vacation") ?? running[0]!;
  const started = sorted.filter((t) => t.startsOn <= today);
  return started.at(-1) ?? sorted[0] ?? null;
}

export type Progress = { entered: number; expected: number; percent: number };

/** Marks entered out of learners x assessments, as a whole percentage (rounded down). */
export function marksProgress(row: {
  learners: number;
  assessments: number;
  marksEntered: number;
}): Progress {
  const expected = row.learners * row.assessments;
  const entered = Math.min(row.marksEntered, expected);
  return {
    entered,
    expected,
    percent: expected === 0 ? 0 : Math.floor((entered / expected) * 100),
  };
}

export type LockReason = "term_locked" | "term_closed" | "deadline_passed";

/** "the term is closed", "the marks deadline (20 Nov 2026) has passed". */
export function describeLock(reason: string | null, deadline: string | null): string {
  switch (reason) {
    case "term_locked":
      return "the term is locked";
    case "term_closed":
      return "the term is closed";
    case "deadline_passed":
      return deadline
        ? `the marks deadline (${formatDate(deadline)}) has passed`
        : "the marks deadline has passed";
    default:
      return "an assessment is locked";
  }
}

/** "Grace Tembo (school admin) or Patrick Zimunya (head)". */
export function describeUnlockers(people: readonly { name: string; role: string }[]): string {
  const roleLabel = (r: string) => (r === "school_admin" ? "school admin" : r);
  const names = people.map((p) => `${p.name} (${roleLabel(p.role)})`);
  if (names.length === 0) return "your school admin or head";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/** "2026-11-20" → "20 Nov 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][m - 1];
  return `${d} ${month} ${y}`;
}
