import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Two-factor sign in for e2e tests (D54). Supabase Auth checks the codes but
 * has no helper that makes one, so tests compute them from the setup key as
 * an authenticator app does (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits).
 */
export function totpCode(secret: string, at = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

/** A 6-digit code that is certainly wrong for this secret now (and either side). */
export function wrongTotpCode(secret: string): string {
  const now = Date.now();
  const valid = new Set([-30_000, 0, 30_000].map((d) => totpCode(secret, now + d)));
  let n = 123456;
  while (valid.has(String(n))) n++;
  return String(n);
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/[\s=]/g, "").toUpperCase()) {
    const i = alphabet.indexOf(c);
    if (i < 0) throw new Error("Not a base32 setup key");
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * Setup keys of test accounts, one file per email, shared by the Playwright
 * workers: global-setup.ts writes the seed's super admins, school admins
 * and heads; a test that sets up a new account's app writes its own.
 */
const DIR = path.join(process.cwd(), "tests", "e2e", ".totp");

export function rememberTotpSecret(email: string, secret: string) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, `${email}.txt`), secret.replace(/\s/g, ""));
}

export function totpSecretFor(email: string): string | null {
  try {
    return readFileSync(path.join(DIR, `${email}.txt`), "utf8").trim();
  } catch {
    return null;
  }
}

export const TOTP_DIR = DIR;
