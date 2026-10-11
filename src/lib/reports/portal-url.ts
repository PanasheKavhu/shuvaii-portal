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
  // A production server without SITE_URL would print whatever host the
  // request named into PDFs that are never made again; only a local
  // production build (the slow-3G check) may go without.
  if (process.env.NODE_ENV === "production" && !isLocalHost(host))
    throw new Error("SITE_URL is not set");
  const proto = h.get("x-forwarded-proto") ?? (isLocalHost(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.");
}
