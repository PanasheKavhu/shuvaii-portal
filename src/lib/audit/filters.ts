import { isUuid } from "@/lib/setup/structure";

/**
 * Filters and paging for the audit screen (D35), read from the page's search
 * params. Pure: anything malformed is dropped, never passed to the database.
 */

export type AuditFilters = {
  learnerId: string | null;
  /** Free text to find a learner by name or number. */
  learnerQuery: string;
  classId: string | null;
  actorId: string | null;
  from: string | null;
  to: string | null;
};

export type AuditCursor = { createdAt: string; id: number };

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(v: string): string | null {
  if (!DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

export function parseAuditFilters(params: Params): AuditFilters {
  const uuid = (key: string) => (isUuid(one(params[key])) ? one(params[key]) : null);
  return {
    learnerId: uuid("learner"),
    learnerQuery: one(params.q).slice(0, 100),
    classId: uuid("class"),
    actorId: uuid("actor"),
    from: date(one(params.from)),
    to: date(one(params.to)),
  };
}

/** Cursor text: the last row's created_at exactly as the database gave it, and its id. */
export function encodeCursor(c: AuditCursor): string {
  return `${c.id}~${c.createdAt}`;
}

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** A real date and time, not only the right shape: 2026-13-45 would make the query fail. */
function isTimestamp(value: string): boolean {
  const m = TIMESTAMP.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCMonth() === mo - 1 && day.getUTCDate() === d && h < 24 && mi < 60 && s < 60;
}

export function decodeCursor(value: string | string[] | undefined): AuditCursor | null {
  const text = one(value);
  const at = text.indexOf("~");
  if (at < 1) return null;
  const id = Number(text.slice(0, at));
  const createdAt = text.slice(at + 1);
  if (!Number.isSafeInteger(id) || id < 1 || !isTimestamp(createdAt)) return null;
  return { createdAt, id };
}

/** Search params for a link to the audit screen with these filters (and a page). */
export function auditQuery(filters: AuditFilters, cursor?: AuditCursor | null): string {
  const q = new URLSearchParams();
  if (filters.learnerId) q.set("learner", filters.learnerId);
  else if (filters.learnerQuery) q.set("q", filters.learnerQuery);
  if (filters.classId) q.set("class", filters.classId);
  if (filters.actorId) q.set("actor", filters.actorId);
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  if (cursor) q.set("before", encodeCursor(cursor));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: AuditFilters): boolean {
  return Boolean(f.learnerId || f.learnerQuery || f.classId || f.actorId || f.from || f.to);
}
