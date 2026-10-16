/**
 * Outgoing email settings for mail the portal sends itself, such as parent
 * codes (D62). Supabase Auth sends its own mail (staff invites, password
 * resets) with the SMTP settings in its dashboard; these are the same
 * server's details, set again for the app. Pure, so it can be unit tested.
 */
export type SmtpConfig = {
  host: string;
  port: number;
  /** TLS from the start (port 465); other ports upgrade with STARTTLS. */
  secure: boolean;
  /** Absent for servers that take mail without signing in (local Mailpit). */
  auth: { user: string; pass: string } | null;
  from: string;
};

type Env = Record<string, string | undefined>;

/** The settings, or null when email is not set up (nothing is sent then). */
export function smtpConfig(env: Env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.EMAIL_FROM?.trim();
  const port = Number(env.SMTP_PORT?.trim() || "465");
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;
  return {
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : null,
    from,
  };
}
