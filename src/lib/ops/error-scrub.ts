/**
 * What error reports may carry (D59, CLAUDE.md rule 5): the error's type,
 * a scrubbed message, stack frames (file, function, line) and the runtime.
 * No learner names, marks, contact details, codes or tokens.
 *
 * Applied in Sentry's beforeSend on the server, the edge and the browser.
 * Allowlist, not blocklist: the request keeps only its method and a
 * scrubbed path; user, cookies, headers, bodies, query strings, breadcrumbs
 * and extra data are dropped. Messages lose quoted values, Postgres detail
 * values, emails, ids, tokens and every number (a mark is a number).
 * Names cannot be recognised in free text, so app code must keep them out of
 * error messages, as it already keeps them out of logs.
 *
 * Pure and dependency-free (typed loosely so it works on any event shape)
 * so it is unit tested.
 */

type Frame = { vars?: unknown };
type Exception = {
  type?: string;
  value?: string;
  stacktrace?: { frames?: Frame[] };
};

export type ScrubbableEvent = {
  message?: string;
  logentry?: { message?: string; formatted?: string; params?: unknown[] };
  exception?: { values?: Exception[] };
  request?: { url?: string; method?: string };
  transaction?: string;
  user?: unknown;
  extra?: unknown;
  breadcrumbs?: unknown;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  server_name?: string;
};

const KEPT_CONTEXTS = new Set(["os", "browser", "runtime", "device", "app", "trace", "culture"]);
/** Path segments that follow these are secrets or codes (share links, report checks). */
const SECRET_AFTER = new Set(["s", "verify", "join", "confirm"]);

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const WHOLE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /[^\s@"'()<>]+@[^\s@"'()<>]+\.[^\s@"'()<>]+/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const LONG_TOKEN = /\b(?=[\w-]*\d)[\w-]{20,}\b/g;
/** Parent codes (XXXX-XXXX-XXXX), verification codes and other upper-case codes. */
const CODE = /\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,}\b|\b[A-Z0-9]{12,}\b/g;
const PG_DETAIL = /=\([^)]*\)/g;
const QUOTED = /"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

export function scrubText(text: string): string {
  return text
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]")
    .replace(UUID, "[id]")
    .replace(LONG_TOKEN, "[token]")
    .replace(CODE, "[code]")
    .replace(PG_DETAIL, "=([value])")
    .replace(QUOTED, "[value]")
    .replace(NUMBER, "[n]")
    .slice(0, 500);
}

/** A URL or path without query, fragment, host details or secret segments. */
export function scrubPath(url: string): string {
  let path = url;
  try {
    path = new URL(url, "http://x").pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const parts = path.split("/");
  return parts
    .map((part, i) => {
      if (i > 0 && SECRET_AFTER.has(parts[i - 1]) && part) return "[redacted]";
      if (/^[\w-]{20,}$/.test(part) && !WHOLE_UUID.test(part)) return "[redacted]";
      return part;
    })
    .join("/");
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out: ScrubbableEvent = { ...event };
  delete out.user;
  delete out.extra;
  delete out.breadcrumbs;
  delete out.server_name;
  if (out.message) out.message = scrubText(out.message);
  if (out.logentry) {
    out.logentry = {
      message: out.logentry.message ? scrubText(out.logentry.message) : undefined,
      formatted: out.logentry.formatted ? scrubText(out.logentry.formatted) : undefined,
    };
  }
  if (out.exception?.values) {
    out.exception = {
      values: out.exception.values.map((ex) => ({
        ...ex,
        value: ex.value ? scrubText(ex.value) : ex.value,
        stacktrace: ex.stacktrace && {
          frames: ex.stacktrace.frames?.map((frame) => {
            const kept = { ...frame };
            delete kept.vars;
            return kept;
          }),
        },
      })),
    };
  }
  if (out.request) {
    out.request = {
      method: out.request.method,
      url: out.request.url ? scrubPath(out.request.url) : undefined,
    };
  }
  if (out.transaction) out.transaction = scrubPath(out.transaction);
  if (out.contexts) {
    out.contexts = Object.fromEntries(
      Object.entries(out.contexts).filter(([key]) => KEPT_CONTEXTS.has(key)),
    );
  }
  if (out.tags) {
    out.tags = Object.fromEntries(
      Object.entries(out.tags).map(([key, value]) => [
        key,
        typeof value === "string" ? scrubPath(scrubText(value)) : value,
      ]),
    );
  }
  return out as E;
}
