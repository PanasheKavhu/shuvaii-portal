import type { SchoolMembership } from "./active-school";
import type { AppRole } from "./roles";

/**
 * Two-factor sign in (SPEC section 5, D54). Super admins, school admins and
 * heads must pass a second step with an authenticator app (Supabase Auth's
 * TOTP) before any role area opens; teachers, hods, parents and learners
 * never see it. Pure: callers pass what they loaded.
 */
export const TWO_FACTOR_ROLES: readonly AppRole[] = ["school_admin", "head"];

/** Supabase Auth's assurance level: aal2 once the second step is passed. */
export type Assurance = "aal1" | "aal2";

export function isAssurance(value: unknown): value is Assurance {
  return value === "aal1" || value === "aal2";
}

/**
 * The `aal` claim of a Supabase access token, or null. Only reads the
 * payload: the caller has the token from a session Auth has just checked.
 */
export function assuranceOf(accessToken: string | undefined): Assurance | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const aal =
      typeof claims === "object" && claims !== null ? (claims as { aal?: unknown }).aal : null;
    return isAssurance(aal) ? aal : null;
  } catch {
    return null;
  }
}

/**
 * Whether this person must use two-factor sign in: a super admin, or a
 * school admin or head in any of their active schools (not only the one
 * they chose, since the database checks every school's role, D54).
 */
export function needsTwoFactor(viewer: {
  isPlatformAdmin: boolean;
  schools: readonly Pick<SchoolMembership, "roles">[];
}): boolean {
  return (
    viewer.isPlatformAdmin ||
    viewer.schools.some((s) => s.roles.some((r) => TWO_FACTOR_ROLES.includes(r)))
  );
}

/** Whether the person still has to pass (or set up) the second step. */
export function secondStepPending(viewer: {
  isPlatformAdmin: boolean;
  schools: readonly Pick<SchoolMembership, "roles">[];
  assurance?: Assurance | null;
}): boolean {
  return needsTwoFactor(viewer) && viewer.assurance !== "aal2";
}

export const TOTP_DIGITS = 6;

/** The 6-digit code from an authenticator app; spaces and dashes are ignored. */
export function parseTotpCode(
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const code = typeof raw === "string" ? raw.replace(/[\s-]/g, "") : "";
  if (!code) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) {
    return { ok: false, error: "The code is 6 digits." };
  }
  return { ok: true, value: code };
}

/** The setup key in groups of four, easier to type into an app by hand. */
export function formatSetupKey(secret: string): string {
  return (secret.replace(/\s/g, "").match(/.{1,4}/g) ?? []).join(" ");
}
