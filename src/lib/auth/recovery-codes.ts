import { createHash, randomInt } from "node:crypto";

/**
 * Two-factor recovery codes (D54): ten single-use codes shown once after a
 * person sets up their authenticator app, stored only as hashes in
 * `mfa_recovery_codes`. Using one signs the person in and makes them set up
 * their app again.
 *
 * A code is 10 characters from an alphabet without look-alikes (no 0/O,
 * 1/I/L), shown as two groups of five: about 49 bits, too many to guess, so
 * a fast hash is enough (as for parent codes, D25). The hash includes the
 * user id, so the same code never hashes the same for two people.
 */
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 10;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

/**
 * A typed recovery code in its stored form (upper case, no spaces or
 * dashes), or null if it cannot be one. Lower case is accepted.
 */
export function normaliseRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== LENGTH) return null;
  return [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

/** SHA-256 (hex) of "<user id>:<normalised code>". */
export function hashRecoveryCode(userId: string, normalisedCode: string): string {
  return createHash("sha256").update(`${userId}:${normalisedCode}`).digest("hex");
}
