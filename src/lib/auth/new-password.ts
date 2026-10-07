/** Validates a new password (invite acceptance, later password reset). Pure. */
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt, which Supabase Auth uses, ignores bytes past 72. */
export const MAX_PASSWORD_LENGTH = 72;

export type NewPasswordParse = { ok: true; value: string } | { ok: false; error: string };

export function parseNewPassword(form: { password: unknown; confirm: unknown }): NewPasswordParse {
  const password = typeof form.password === "string" ? form.password : "";
  const confirm = typeof form.confirm === "string" ? form.confirm : "";

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { ok: false, error: "The two passwords do not match." };
  return { ok: true, value: password };
}
