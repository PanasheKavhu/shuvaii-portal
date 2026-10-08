/**
 * Parent invite codes (US-1.3, D25). Pure apart from the random source the
 * caller passes in, so it is unit tested.
 *
 * A code is 12 characters from an alphabet without look-alikes (no 0, O, 1,
 * I or L), shown in three groups of four, about 59 bits: far too many to
 * guess. Only its SHA-256 hash is stored.
 */
import { createHash } from "node:crypto";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 12;

/**
 * httpOnly cookie holding the code from a /join link or the code form. The
 * proxy moves `?code=` into it and redirects to a clean /join, so the
 * one-time code does not stay in the address bar or history (D28).
 */
export const JOIN_CODE_COOKIE = "sp_join_code";
export const JOIN_CODE_MAX_AGE_S = 60 * 60;

/** A new code; `randomInt(n)` returns a uniform integer in [0, n). */
export function generateInviteCode(randomInt: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** XXXX-XXXX-XXXX, for reading aloud and printing. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/**
 * The code as typed or taken from a link: case, spaces and dashes are
 * ignored. Null when it cannot be a code.
 */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** What the database stores and looks codes up by. */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** The link printed with the code; `origin` is the portal's address. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/join?code=${formatInviteCode(code)}`;
}
