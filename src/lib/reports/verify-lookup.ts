import "server-only";

import { addressHash, addressLimit, recordAttempt } from "@/lib/auth/sign-in-attempts";
import { clientAddress } from "@/lib/request/client-address";
import { createAdminClient } from "@/lib/supabase/admin";
import { VERIFY_LIMIT, VERIFY_WINDOW_MS, readVerification, type Verification } from "./verify";

/**
 * The public verification page's reads (US-6.5; D45), with the service
 * role: visitors are not signed in. Only the five printed facts leave the
 * database. Lookups are counted per network address in `sign_in_attempts`
 * under a hash (as wrong PINs are, D28), so the address itself is never
 * stored.
 */

export type VerifyOutcome =
  | { kind: "found"; report: Verification }
  | { kind: "not-found" }
  | { kind: "limited"; minutes: number }
  | { kind: "unavailable" };

export async function verifyReport(code: string | null, now = new Date()): Promise<VerifyOutcome> {
  const admin = createAdminClient();
  const hash = addressHash("report-verify", await clientAddress());
  const limited = await addressLimit(admin, hash, now, VERIFY_LIMIT, VERIFY_WINDOW_MS);
  if (limited === "unavailable") return { kind: "unavailable" };
  if (limited) return { kind: "limited", minutes: limited.minutes };

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
  const recorded = await recordAttempt(admin, hash, !!found.data);
  if (found.error || !recorded) return { kind: "unavailable" };

  const report = readVerification(found.data);
  return report ? { kind: "found", report } : { kind: "not-found" };
}
