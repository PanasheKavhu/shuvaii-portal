/**
 * Password reset input rules (US-1.7). Pure: the server actions call these
 * at the boundary.
 */
import { EMAIL_RE, normalizeEmail } from "./sign-in-input";

/** httpOnly cookie naming the Auth session that a reset link or code opened (D19). */
export const RESET_COOKIE = "sp_reset";
/** How long after verifying the link or code a new password may be set. */
export const RESET_WINDOW_S = 15 * 60;
/** Matches `otp_length` in supabase/config.toml. */
export const RESET_CODE_LENGTH = 6;

export type Parse<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseResetEmail(form: { email: unknown }): Parse<string> {
  const email = typeof form.email === "string" ? normalizeEmail(form.email) : "";
  if (!email) return { ok: false, error: "Enter your email address." };
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, value: email };
}

/** The code from the email, forgiving spaces people type between digits. */
export function parseResetCode(form: {
  email: unknown;
  code: unknown;
}): Parse<{ email: string; code: string }> {
  const email = parseResetEmail(form);
  if (!email.ok) return email;
  const code = typeof form.code === "string" ? form.code.replace(/\s+/g, "") : "";
  if (code.length !== RESET_CODE_LENGTH || !/^\d+$/.test(code)) {
    return { ok: false, error: `Enter the ${RESET_CODE_LENGTH}-digit code from the email.` };
  }
  return { ok: true, value: { email: email.value, code } };
}

/**
 * True when the reset cookie names the current Auth session, so only the
 * session a reset link or code opened may set a password without the old one.
 */
export function isResetSession(cookieValue: string | undefined, sessionId: unknown): boolean {
  return typeof sessionId === "string" && sessionId !== "" && cookieValue === sessionId;
}
