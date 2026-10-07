import type { Metadata } from "next";
import { NotAllowed } from "@/components/not-allowed";

export const metadata: Metadata = { title: "Not allowed", robots: { index: false } };

/** Target of the proxy's 403 rewrite for role areas (src/proxy.ts). */
export default function NotAllowedPage() {
  return <NotAllowed />;
}
