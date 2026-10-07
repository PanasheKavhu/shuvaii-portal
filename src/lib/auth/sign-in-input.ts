/** Validates the staff sign-in form at the server-action boundary. Pure. */
export type SignInInput = { email: string; password: string };

export type SignInParse = { ok: true; value: SignInInput } | { ok: false; error: string };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseSignIn(form: { email: unknown; password: unknown }): SignInParse {
  const email = typeof form.email === "string" ? normalizeEmail(form.email) : "";
  const password = typeof form.password === "string" ? form.password : "";

  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length > 200) return { ok: false, error: "Email or password is incorrect." };
  return { ok: true, value: { email, password } };
}
