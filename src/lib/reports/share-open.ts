import "server-only";

import { createHash } from "node:crypto";
import { addressHash, addressLimit, recordAttempt } from "@/lib/auth/sign-in-attempts";
import { clientAddress } from "@/lib/request/client-address";
import { createAdminClient } from "@/lib/supabase/admin";
import { isShareToken, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS } from "./portal";
import { PDF_URL_SECONDS, REPORTS_BUCKET } from "./storage";

/**
 * Opening a share link with no sign in (US-7.3; D47), with the service
 * role. `open_report_share()` decides whether the link is live and logs the
 * open (which link and when, nothing personal); this adds the limit per
 * network address, counted in `sign_in_attempts` under a hash of the
 * address as the verification page does (D45), and a 60-second signed URL
 * to the stored PDF, which is never made again.
 */

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ShareOutcome =
  | { kind: "open"; url: string }
  | { kind: "gone" }
  | { kind: "limited"; minutes: number }
  | { kind: "unavailable" };

export async function openShareLink(token: string, now = new Date()): Promise<ShareOutcome> {
  const admin = createAdminClient();
  const source = addressHash("report-share", await clientAddress());
  const limited = await addressLimit(admin, source, now, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS);
  if (limited === "unavailable") return { kind: "unavailable" };
  if (limited) return { kind: "limited", minutes: limited.minutes };

  // A malformed token still counts, so guessing costs the same either way.
  const opened = isShareToken(token)
    ? await admin.rpc("open_report_share", { p_token_hash: tokenHash(token) })
    : { data: [], error: null };
  const row = opened.data?.[0];
  const recorded = await recordAttempt(admin, source, !!row);
  if (opened.error || !recorded) return { kind: "unavailable" };
  if (!row) return { kind: "gone" };

  const signed = await admin.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(row.pdf_path, PDF_URL_SECONDS);
  if (signed.error) return { kind: "unavailable" };
  return { kind: "open", url: signed.data.signedUrl };
}
