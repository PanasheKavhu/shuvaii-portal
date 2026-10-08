/**
 * The parent account form on /join (US-1.3). Pure: the server action calls
 * it at the boundary.
 */
import { parseNewPassword } from "./new-password";
import { EMAIL_RE, normalizeEmail } from "./sign-in-input";

export type ParentSignUp = { fullName: string; email: string; password: string };

export type ParentSignUpParse =
  | { ok: true; value: ParentSignUp }
  | { ok: false; errors: Partial<Record<"fullName" | "email" | "password", string>> };

export function parseParentSignUp(form: {
  fullName: unknown;
  email: unknown;
  password: unknown;
  confirm: unknown;
}): ParentSignUpParse {
  const fullName =
    typeof form.fullName === "string" ? form.fullName.trim().replace(/\s+/g, " ") : "";
  const email = typeof form.email === "string" ? normalizeEmail(form.email) : "";
  const password = parseNewPassword({ password: form.password, confirm: form.confirm });

  const errors: Partial<Record<"fullName" | "email" | "password", string>> = {};
  if (fullName.length < 2 || fullName.length > 120) errors.fullName = "Enter your full name.";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!password.ok) errors.password = password.error;

  if (Object.keys(errors).length > 0 || !password.ok) return { ok: false, errors };
  return { ok: true, value: { fullName, email, password: password.value } };
}
