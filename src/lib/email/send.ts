import "server-only";

import nodemailer from "nodemailer";
import { smtpConfig } from "./config";

export type Email = { to: string; subject: string; text: string; html: string };

/** Whether the portal can send its own email (SMTP_* and EMAIL_FROM are set). */
export function emailConfigured(): boolean {
  return smtpConfig(process.env) !== null;
}

/**
 * Sends one email; true when the server accepted it. Never logs the
 * address or the contents (CLAUDE.md rule 5), only that a send failed.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  const config = smtpConfig(process.env);
  if (!config) return false;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth ?? undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({ from: config.from, ...email });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.error("email send failed", typeof code === "string" ? code : "unknown");
    return false;
  } finally {
    transport.close();
  }
}
