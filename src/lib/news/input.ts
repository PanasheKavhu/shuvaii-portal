import { isUuid } from "@/lib/setup/structure";
import { expiresAtForDate, isDate } from "./visibility";

/**
 * The newsletter form (US-8.1, US-8.4; D50): who an announcement is for and
 * what the admin typed, checked before it reaches save_announcement(),
 * which checks again. Pure.
 */

export const AUDIENCES = ["all", "staff", "learners", "parents", "class"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "Whole school",
  staff: "Staff",
  learners: "Learners",
  parents: "Parents",
  class: "One class",
};

/** "Parents", or "4 Blue (class)" for a class announcement. */
export function audienceLabel(audience: Audience, className?: string | null): string {
  return audience === "class" ? `${className ?? "One class"} (class)` : AUDIENCE_LABELS[audience];
}

/** Who sees a preview's announcement, in words: "parents", "the whole school", "4 Blue's learners, parents and teachers". */
export function audienceInWords(audience: Audience, className?: string | null): string {
  switch (audience) {
    case "all":
      return "everyone in the school";
    case "staff":
      return "staff";
    case "learners":
      return "learners";
    case "parents":
      return "parents";
    case "class":
      return `${className ?? "the class"}'s learners, parents and teachers`;
  }
}

export const isAudience = (v: unknown): v is Audience =>
  typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);

export const TITLE_MAX = 200;
export const BODY_MAX = 20000;

export type AnnouncementInput = {
  title: string;
  body: string;
  audience: Audience;
  classId: string | null;
  pinned: boolean;
  /** The stored expiry instant, or null for none. */
  expiresAt: string | null;
};

export type ParseResult =
  | { ok: true; value: AnnouncementInput }
  | {
      ok: false;
      errors: Partial<Record<"title" | "body" | "audience" | "classId" | "expiresOn", string>>;
    };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Checks the form's raw values. `today` is the school's date; an expiry
 * date must be today or later, except the one already saved (`savedExpiresOn`),
 * so a typo in an expired post can be fixed without moving its date.
 */
export function parseAnnouncementInput(
  raw: {
    title: unknown;
    body: unknown;
    audience: unknown;
    classId: unknown;
    pinned: unknown;
    expiresOn: unknown;
  },
  ctx: { today: string; timeZone: string; savedExpiresOn?: string | null },
): ParseResult {
  const errors: Extract<ParseResult, { ok: false }>["errors"] = {};
  const title = str(raw.title).trim();
  // Keep the body's own line breaks and spacing; only trailing space goes.
  const body = str(raw.body).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const audience = raw.audience;
  const classId = str(raw.classId).trim();
  const expiresOn = str(raw.expiresOn).trim();

  if (!title) errors.title = "Enter a title.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters.`;
  if (!body.trim()) errors.body = "Write the announcement.";
  else if (body.length > BODY_MAX) errors.body = `Keep the announcement to ${BODY_MAX} characters.`;
  if (!isAudience(audience)) errors.audience = "Choose who this is for.";
  else if (audience === "class" && !isUuid(classId)) errors.classId = "Choose the class.";
  if (expiresOn) {
    if (!isDate(expiresOn)) errors.expiresOn = "Enter a date, or leave it empty.";
    else if (expiresOn < ctx.today && expiresOn !== ctx.savedExpiresOn) {
      errors.expiresOn = "Choose today or a later date.";
    }
  }

  if (Object.keys(errors).length > 0 || !isAudience(audience)) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      body,
      audience,
      classId: audience === "class" ? classId : null,
      pinned: raw.pinned === "on" || raw.pinned === "true" || raw.pinned === true,
      expiresAt: expiresOn ? expiresAtForDate(expiresOn, ctx.timeZone) : null,
    },
  };
}
