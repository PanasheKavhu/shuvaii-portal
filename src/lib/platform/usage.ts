/**
 * The console's usage numbers (US-10.4) and onboarding checklist (D56).
 * Pure: the numbers come from school_usage() and school_onboarding(), which
 * return no personal data (D5, D17).
 */

export type SchoolUsage = {
  schoolId: string;
  activeLearners: number;
  activeStaff: number;
  activeParents: number;
  bytes: { reports: number; attachments: number; imports: number; branding: number };
  publishedReports: number;
  lastSignInAt: string | null;
  lastMarksAt: string | null;
  lastActivityAt: string | null;
};

/** A school with no sign in or marks entry for this long is flagged as quiet. */
export const QUIET_AFTER_DAYS = 14;

export function totalBytes(usage: Pick<SchoolUsage, "bytes">): number {
  const { reports, attachments, imports, branding } = usage.bytes;
  return reports + attachments + imports + branding;
}

/** "0 B", "980 B", "12.4 KB", "3.1 MB", "1.2 GB" (1 KB = 1,024 bytes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit]}`;
}

/** Whole days since a time, or null when there was none. */
export function daysSince(at: string | null, now: Date): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000));
}

/** "Today", "Yesterday", "5 days ago", or "Never". */
export function ago(at: string | null, now: Date): string {
  const days = daysSince(at, now);
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function isQuiet(lastActivityAt: string | null, now: Date): boolean {
  const days = daysSince(lastActivityAt, now);
  return days === null || days >= QUIET_AFTER_DAYS;
}

/** Quietest first: never active, then the longest since any activity. */
export function byLastActivity(a: SchoolUsage, b: SchoolUsage): number {
  if (a.lastActivityAt === b.lastActivityAt) return 0;
  if (!a.lastActivityAt) return -1;
  if (!b.lastActivityAt) return 1;
  return a.lastActivityAt < b.lastActivityAt ? -1 : 1;
}

// Onboarding ------------------------------------------------------------------------

export const ONBOARDING_ITEMS = {
  grading_scales: {
    label: "Grading scale complete for every grade level",
    where: "The school admin enters it in School setup, Grading.",
  },
  term_dates: {
    label: "Term dates set for the current year",
    where: "The school admin adds the year's terms in School setup.",
  },
  class_teachers: {
    label: "A class teacher for every class",
    where: "The school admin picks one per class in School setup, Classes.",
  },
  branding: { label: "Logo and colours set", where: "Set them on this page." },
  report_images: {
    label: "Stamp and head's signature uploaded",
    where: "The school admin uploads them in Report settings.",
  },
  report_template: {
    label: "Report template reviewed",
    where: "The school admin checks and saves the term report in Report settings.",
  },
  first_admin: {
    label: "First school admin accepted, with two-factor set up",
    where: "The admin accepts the invite and sets up an authenticator app at sign in.",
  },
  privacy_contact: {
    label: "Privacy notice contact filled in",
    where: "Fill it in on this page.",
  },
} as const;

export type OnboardingKey = keyof typeof ONBOARDING_ITEMS;

export type OnboardingItem = {
  key: OnboardingKey;
  label: string;
  where: string;
  done: boolean;
  /** What is still missing, in words, when the database counted it. */
  missing: string | null;
};

function missingText(key: OnboardingKey, missing: number | null): string | null {
  if (!missing) return null;
  const s = missing === 1 ? "" : "s";
  if (key === "grading_scales")
    return `${missing} grade level${s} still need${missing === 1 ? "s" : ""} a complete scale.`;
  if (key === "class_teachers")
    return `${missing} class${missing === 1 ? "" : "es"} without a class teacher.`;
  return null;
}

/** The checklist in the console's order, from school_onboarding() rows; unknown keys are dropped. */
export function onboardingItems(
  rows: readonly { item: string; done: boolean; missing: number | null }[],
): OnboardingItem[] {
  return (Object.keys(ONBOARDING_ITEMS) as OnboardingKey[]).map((key) => {
    const row = rows.find((r) => r.item === key);
    const done = row?.done === true;
    return {
      key,
      ...ONBOARDING_ITEMS[key],
      done,
      missing: done ? null : missingText(key, row?.missing ?? null),
    };
  });
}
