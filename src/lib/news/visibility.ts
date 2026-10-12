/**
 * When an announcement is shown, and in what order (US-8.2, US-8.4; D49,
 * D50). The database applies the same rules (my_announcements(), my_news());
 * these let the screens label and sort what they get, and keep the date
 * handling in one tested place. Pure.
 */

export type AnnouncementStatus = "draft" | "published" | "archived";

/** Live: published and not past its expiry. Only live ones reach the audience. */
export function isLive(
  a: { status: AnnouncementStatus; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  return (
    a.status === "published" && (a.expiresAt === null || Date.parse(a.expiresAt) > now.getTime())
  );
}

/** Published but past its expiry: the audience no longer sees it; admin and head do. */
export function isExpired(
  a: { status: AnnouncementStatus; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  return a.status === "published" && !isLive(a, now);
}

/**
 * The feed's order: pinned live ones first, then newest first by published
 * date (creation date for drafts), then by id so equal dates never shuffle.
 */
export function compareNews(
  a: {
    id: string;
    pinned: boolean;
    live: boolean;
    publishedAt: string | null;
    createdAt?: string | null;
  },
  b: {
    id: string;
    pinned: boolean;
    live: boolean;
    publishedAt: string | null;
    createdAt?: string | null;
  },
): number {
  const pa = a.pinned && a.live ? 1 : 0;
  const pb = b.pinned && b.live ? 1 : 0;
  if (pa !== pb) return pb - pa;
  const da = Date.parse(a.publishedAt ?? a.createdAt ?? "") || 0;
  const db = Date.parse(b.publishedAt ?? b.createdAt ?? "") || 0;
  if (da !== db) return db - da;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortNews<T extends Parameters<typeof compareNews>[0]>(items: readonly T[]): T[] {
  return [...items].sort(compareNews);
}

// Expiry dates --------------------------------------------------------------
//
// The admin picks the last day a post is shown; it disappears at midnight
// at the end of that day in the school's time zone. The database stores the
// moment it disappears (expires_at).

/** Milliseconds the zone is ahead of UTC at instant `t`. */
function zoneOffset(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** The instant a date (YYYY-MM-DD) begins in a time zone. */
function startOfDay(date: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - zoneOffset(guess, timeZone);
  const second = zoneOffset(t, timeZone);
  if (guess - second !== t) t = guess - second;
  return t;
}

/** "2026-10-20" → "2026-10-21": the next calendar day. */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export const isDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * The stored expiry for "shown until the end of `date`": midnight after that
 * date in the school's zone, as an ISO instant.
 */
export function expiresAtForDate(date: string, timeZone: string): string {
  return new Date(startOfDay(nextDay(date), timeZone)).toISOString();
}

/** The last day shown (YYYY-MM-DD) for a stored expiry, in the school's zone. */
export function lastDayShown(expiresAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(Date.parse(expiresAt) - 1));
}
