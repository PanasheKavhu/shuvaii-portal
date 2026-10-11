import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isShareToken, SHARE_OPEN_LIMIT, SHARE_OPEN_WINDOW_MS } from "./portal";
import { PDF_URL_SECONDS, REPORTS_BUCKET } from "./storage";
import { limitedUntil } from "./verify";

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

export function shareSourceHash(address: string): string {
  return createHash("sha256").update(`report-share:${address}`).digest("hex");
}

async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type ShareOutcome =
  | { kind: "open"; url: string }
  | { kind: "gone" }
  | { kind: "limited"; minutes: number }
  | { kind: "unavailable" };

export async function openShareLink(token: string, now = new Date()): Promise<ShareOutcome> {
  const admin = createAdminClient();
  const source = shareSourceHash(await clientAddress());

  const recent = await admin
    .from("sign_in_attempts")
    .select("created_at")
    .eq("email_hash", source)
    .gte("created_at", new Date(now.getTime() - SHARE_OPEN_WINDOW_MS).toISOString());
  if (recent.error) return { kind: "unavailable" };
  const blocked = limitedUntil(
    recent.data.map((r) => new Date(r.created_at)),
    now,
    SHARE_OPEN_LIMIT,
    SHARE_OPEN_WINDOW_MS,
  );
  if (blocked) {
    return {
      kind: "limited",
      minutes: Math.max(1, Math.ceil((blocked.getTime() - now.getTime()) / 60_000)),
    };
  }

  // A malformed token still counts, so guessing costs the same either way.
  const opened = isShareToken(token)
    ? await admin.rpc("open_report_share", { p_token_hash: tokenHash(token) })
    : { data: [], error: null };
  const row = opened.data?.[0];
  const recorded = await admin
    .from("sign_in_attempts")
    .insert({ email_hash: source, succeeded: !!row });
  if (opened.error || recorded.error) return { kind: "unavailable" };
  if (!row) return { kind: "gone" };

  const signed = await admin.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(row.pdf_path, PDF_URL_SECONDS);
  if (signed.error) return { kind: "unavailable" };
  return { kind: "open", url: signed.data.signedUrl };
}
