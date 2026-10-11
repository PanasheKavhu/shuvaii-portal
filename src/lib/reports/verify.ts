/**
 * Checking a report from its QR code (US-6.5; D45). Pure: the page loads
 * the report and the recent lookups and passes them in.
 */

/** Verification codes: 24 characters from the 32 unambiguous letters and digits (D43). */
const CODE_RE = /^[A-HJ-NP-Z2-9]{24}$/;

/** The code from the address, tidied (case, spaces, dashes), or null when it cannot be one. */
export function normalizeVerificationCode(raw: string): string | null {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const code = decoded.replace(/[\s-]/g, "").toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Lookups per network address: 30 in 10 minutes, then wait until the oldest drops out. */
export const VERIFY_LIMIT = 30;
export const VERIFY_WINDOW_MS = 10 * 60 * 1000;

/** When this address may look up again, or null if it may now. */
export function verifyBlockedUntil(lookups: readonly Date[], now: Date): Date | null {
  const recent = lookups
    .map((d) => d.getTime())
    .filter((t) => t > now.getTime() - VERIFY_WINDOW_MS && t <= now.getTime())
    .sort((a, b) => a - b);
  if (recent.length < VERIFY_LIMIT) return null;
  return new Date(recent[recent.length - VERIFY_LIMIT]! + VERIFY_WINDOW_MS);
}

export const NOT_FOUND = "Report not found";
export const WITHDRAWN = "Report withdrawn";

/** What the page shows: only the reference, learner, school, term and status (US-6.5). */
export type Verification = {
  /** Withdrawn by the school (US-6.6): no longer valid; a newer version replaces it. */
  withdrawn: boolean;
  reference: string;
  learnerName: string;
  schoolName: string;
  termName: string;
  status: string;
};

export type VerifyRow = {
  status: string;
  reference_code: string | null;
  learner_name: string | null;
  school_name: string | null;
  term_name: string | null;
  version: number | null;
};

/**
 * A published or withdrawn report as the page shows it (D46: a withdrawn
 * code says so, so whoever holds the old paper knows to ask for the new
 * one); a report that was never published is not found.
 */
export function readVerification(row: VerifyRow | null): Verification | null {
  if (!row || !row.reference_code) return null;
  if (row.status !== "published" && row.status !== "withdrawn") return null;
  const withdrawn = row.status === "withdrawn";
  return {
    withdrawn,
    reference: row.reference_code,
    learnerName: row.learner_name ?? "",
    schoolName: row.school_name ?? "",
    termName: row.term_name ?? "",
    status: withdrawn
      ? "Withdrawn by the school: no longer valid"
      : row.version && row.version > 1
        ? `Valid: published by the school (amended, version ${row.version})`
        : "Valid: published by the school",
  };
}
