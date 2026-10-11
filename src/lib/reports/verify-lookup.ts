import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  VERIFY_WINDOW_MS,
  readVerification,
  verifyBlockedUntil,
  type Verification,
} from "./verify";

/**
 * The public verification page's reads (US-6.5; D45), with the service
 * role: visitors are not signed in. Only the five printed facts leave the
 * database. Lookups are counted per network address in `sign_in_attempts`
 * under a hash (as wrong PINs are, D28), so the address itself is never
 * stored.
 */

export function verifySourceHash(address: string): string {
  return createHash("sha256").update(`report-verify:${address}`).digest("hex");
}

/** The caller's network address as the hosting proxy reports it. */
async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type VerifyOutcome =
  | { kind: "found"; report: Verification }
  | { kind: "not-found" }
  | { kind: "limited"; minutes: number }
  | { kind: "unavailable" };

export async function verifyReport(code: string | null, now = new Date()): Promise<VerifyOutcome> {
  const admin = createAdminClient();
  const hash = verifySourceHash(await clientAddress());

  const recent = await admin
    .from("sign_in_attempts")
    .select("created_at")
    .eq("email_hash", hash)
    .gte("created_at", new Date(now.getTime() - VERIFY_WINDOW_MS).toISOString());
  if (recent.error) return { kind: "unavailable" };
  const blocked = verifyBlockedUntil(
    recent.data.map((r) => new Date(r.created_at)),
    now,
  );
  if (blocked) {
    return {
      kind: "limited",
      minutes: Math.max(1, Math.ceil((blocked.getTime() - now.getTime()) / 60_000)),
    };
  }

  // A malformed code is still a lookup, so guessing costs the same either way.
  const found = code
    ? await admin
        .from("reports")
        .select(
          "status, reference_code, version, learner_name:snapshot->learner->>name, school_name:snapshot->school->>name, term_name:snapshot->term->>name",
        )
        .eq("verification_code", code)
        .maybeSingle()
    : { data: null, error: null };
  const recorded = await admin
    .from("sign_in_attempts")
    .insert({ email_hash: hash, succeeded: !!found.data });
  if (found.error || recorded.error) return { kind: "unavailable" };

  const report = readVerification(found.data);
  return report ? { kind: "found", report } : { kind: "not-found" };
}
