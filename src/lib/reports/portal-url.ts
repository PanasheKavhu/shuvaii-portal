import "server-only";

import { headers } from "next/headers";

/**
 * The portal's own address for links printed on reports (the QR code,
 * REPORT_LAYOUT section 4). SITE_URL when set, which production must set so
 * every PDF carries the same address (go-live checklist); otherwise the
 * address this request came in on, for local runs.
 */
export async function portalUrl(): Promise<string> {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
