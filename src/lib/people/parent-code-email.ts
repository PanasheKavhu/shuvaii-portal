import type { Email } from "@/lib/email/send";

export type ParentCodeEmailInput = {
  schoolName: string;
  guardianName: string;
  /** The code as printed, e.g. ABCD-EFGH. */
  code: string;
  /** The /join link with the code filled in. */
  link: string;
  /** The last day the code works, already formatted. */
  expiresOn: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The email that carries a parent code to a guardian (US-1.3, D62). */
export function parentCodeEmail(input: ParentCodeEmailInput): Omit<Email, "to"> {
  const { schoolName, guardianName, code, link, expiresOn } = input;
  const subject = `Your parent code for ${schoolName}`;
  const text = [
    `Dear ${guardianName},`,
    "",
    `${schoolName} has set up a parent account for you on the school's reports portal, where you can see your child's reports and school news.`,
    "",
    `Open this link to set up your account:`,
    link,
    "",
    `Or go to the portal's Join page and type this code: ${code}`,
    "",
    `The code works once, until ${expiresOn}. If it runs out, ask the school for a new one.`,
    "",
    `If you were not expecting this email, you can ignore it.`,
  ].join("\n");
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:16px">
<p>Dear ${e(guardianName)},</p>
<p>${e(schoolName)} has set up a parent account for you on the school's reports portal, where you can see your child's reports and school news.</p>
<p><a href="${e(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Set up my parent account</a></p>
<p>Or go to the portal's Join page and type this code:</p>
<p style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${e(code)}</p>
<p>The code works once, until ${e(expiresOn)}. If it runs out, ask the school for a new one.</p>
<p style="color:#555;font-size:14px">If you were not expecting this email, you can ignore it.</p>
</body></html>`;
  return { subject, text, html };
}
