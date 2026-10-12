import { isExportKind } from "./sheets";

/**
 * The export form's input, checked at the route boundary (US-9.4, D52).
 * Pure.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExportForm =
  { kind: "learners" } | { kind: "marks" | "comments"; classId: string; termId: string };

/** What the form asked for, or null when anything is missing or malformed. */
export function parseExportForm(form: { get(name: string): unknown }): ExportForm | null {
  const kind = form.get("kind");
  if (!isExportKind(kind)) return null;
  if (kind === "learners") return { kind };
  const classId = form.get("class");
  const termId = form.get("term");
  if (typeof classId !== "string" || !UUID.test(classId)) return null;
  if (typeof termId !== "string" || !UUID.test(termId)) return null;
  return { kind, classId, termId };
}

/**
 * Whether a POST came from the portal's own pages: the Origin header, when
 * the browser sends one, must name the address the request was made to.
 * Session cookies are SameSite=Lax as well, so another site's form never
 * carries them; this refuses such a post before anything is read.
 */
export function isSameOrigin(headers: Pick<Headers, "get">, requestUrl: string): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(requestUrl).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
