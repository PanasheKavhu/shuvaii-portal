import { isAppRole, roleLabel } from "@/lib/auth/roles";

/**
 * Audit log rows in plain words (D35). Pure: the caller passes one row of
 * public.audit_entries() with the names already looked up.
 *
 * Only the fields listed in FIELDS below are ever shown, so ids, account
 * links and anything secret (PIN and parent-code events carry none, but
 * nothing else would be shown either) stay out of the screen, and raw JSON
 * is never printed.
 */

export type AuditAction = "insert" | "update" | "delete" | "event";

export type AuditEntry = {
  id: number;
  createdAt: string;
  table: string;
  action: AuditAction;
  event: string | null;
  reason: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  actorName: string | null;
  learnerName: string | null;
  learnerNumber: string | null;
  className: string | null;
  subjectName: string | null;
  assessmentName: string | null;
  /** The guardian, staff member or school the row is about. */
  personName: string | null;
  /** An enrolment's class before the change. */
  otherClassName: string | null;
};

export type AuditChange = { label: string; from: string | null; to: string | null };

export type AuditLine = {
  summary: string;
  changes: AuditChange[];
  reason: string | null;
};

type Field = { key: string; label: string; format?: (value: unknown) => string | null };

const yesNo = (v: unknown) => (v === true ? "yes" : v === false ? "no" : null);
const percent = (v: unknown) => (v == null ? null : `${formatNumber(v)}%`);
const doneOrDraft = (v: unknown) => (v === "submitted" ? "done" : v === "draft" ? "draft" : null);
const role = (v: unknown) => (isAppRole(v) ? roleLabel(v) : words(v));

/** The fields shown for each table, in order. Anything else is never shown. */
const FIELDS: Record<string, Field[]> = {
  assessments: [
    { key: "name", label: "Name" },
    { key: "type", label: "Type", format: words },
    { key: "max_mark", label: "Out of", format: formatNumber },
    { key: "weight_percent", label: "Weight", format: percent },
    { key: "assessed_on", label: "Date" },
    { key: "is_locked", label: "Locked", format: yesNo },
  ],
  subject_comments: [
    { key: "comment", label: "Comment" },
    { key: "status", label: "Status", format: doneOrDraft },
  ],
  class_comments: [
    { key: "comment", label: "Comment" },
    { key: "status", label: "Status", format: doneOrDraft },
  ],
  learners: [
    { key: "first_name", label: "First name" },
    { key: "last_name", label: "Surname" },
    { key: "learner_number", label: "Learner number" },
    { key: "date_of_birth", label: "Date of birth" },
    { key: "sex", label: "Sex" },
    { key: "admission_date", label: "Admission date" },
    { key: "status", label: "Status", format: words },
  ],
  enrolments: [{ key: "status", label: "Enrolment", format: words }],
  guardians: [
    { key: "full_name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ],
  guardian_links: [
    { key: "relationship", label: "Relationship" },
    { key: "is_primary", label: "Primary guardian", format: yesNo },
  ],
  memberships: [
    { key: "role", label: "Role", format: role },
    { key: "status", label: "Access", format: words },
  ],
  profiles: [
    { key: "full_name", label: "Name" },
    { key: "phone", label: "Phone" },
  ],
  schools: [
    { key: "primary_color", label: "Main colour" },
    { key: "accent_color", label: "Accent colour" },
    {
      key: "logo_path",
      label: "Logo",
      format: (v) => (typeof v === "string" && v ? "uploaded" : "none"),
    },
  ],
};

export function describeAuditEntry(e: AuditEntry): AuditLine {
  const actor = e.actorName?.trim() || "The system";
  const learner = e.learnerName ?? "a learner";
  const place = [e.className, e.subjectName].filter(Boolean).join(" ") || "a class subject";
  const data = e.newData ?? e.oldData ?? {};
  const changes = changesFor(e);
  const changed = (key: string) => changes.some((c) => c.label === labelOf(e.table, key));
  let reason = e.reason;
  let summary: string;

  switch (e.table) {
    case "marks": {
      const what = `${possessive(learner)} ${e.assessmentName ?? "assessment"} mark in ${place}`;
      const from = e.oldData ? markValue(e.oldData) : null;
      const to = e.newData ? markValue(e.newData) : null;
      summary =
        e.action === "insert"
          ? `${actor} entered ${what}: ${to}`
          : e.action === "update"
            ? `${actor} changed ${what} from ${from} to ${to}`
            : `${actor} removed ${what}`;
      return { summary, changes: [{ label: "Mark", from, to }], reason };
    }
    case "assessments": {
      const name = text(data.name) ?? e.assessmentName ?? "an assessment";
      summary =
        e.action === "insert"
          ? `${actor} added the assessment ${name} to ${place}`
          : e.action === "delete"
            ? `${actor} removed the assessment ${name} from ${place}`
            : `${actor} changed the assessment ${name} in ${place}`;
      break;
    }
    case "subject_comments":
    case "class_comments": {
      const kind =
        e.table === "class_comments"
          ? "class teacher's comment"
          : `${e.subjectName ?? "subject"} comment`;
      const what = `${possessive(learner)} ${kind} in ${e.className ?? "their class"}`;
      const nowDone = e.newData?.status === "submitted" && e.oldData?.status !== "submitted";
      summary =
        e.action === "insert"
          ? `${actor} wrote ${what}${nowDone ? " and marked it done" : ""}`
          : nowDone && !changed("comment")
            ? `${actor} marked ${what} done`
            : `${actor} changed ${what}${nowDone ? " and marked it done" : ""}`;
      break;
    }
    case "class_subject_unlocks":
      if (e.event === "marks_relocked") {
        summary = `${actor} relocked marks for ${place}`;
        reason ??= text(e.oldData?.reason) ? `Unlocked for: ${text(e.oldData?.reason)}` : null;
      } else {
        summary = `${actor} unlocked marks for ${place}`;
      }
      return { summary, changes: [], reason };
    case "learners":
      if (e.event === "learner_pin_set") {
        return { summary: `${actor} set a new sign-in PIN for ${learner}`, changes: [], reason };
      }
      summary =
        e.action === "insert"
          ? `${actor} added the learner ${learner}${e.learnerNumber ? ` (${e.learnerNumber})` : ""}`
          : changes.length === 1 && changed("status")
            ? `${actor} changed ${possessive(learner)} status from ${changes[0]!.from} to ${changes[0]!.to}`
            : `${actor} changed ${possessive(learner)} details`;
      break;
    case "enrolments": {
      const klass = e.className ?? "a class";
      if (e.action === "insert") {
        summary = `${actor} enrolled ${learner} in ${klass}`;
      } else if (
        e.action === "update" &&
        e.oldData?.class_id !== e.newData?.class_id &&
        e.otherClassName
      ) {
        changes.unshift({ label: "Class", from: e.otherClassName, to: e.className });
        summary = `${actor} moved ${learner} from ${e.otherClassName} to ${klass}`;
      } else {
        summary = `${actor} changed ${possessive(learner)} enrolment in ${klass}`;
      }
      break;
    }
    case "guardians": {
      const name = e.personName ?? text(data.full_name) ?? "a guardian";
      summary =
        e.action === "insert"
          ? `${actor} added the guardian ${name}`
          : `${actor} changed the guardian ${possessive(name)} details`;
      break;
    }
    case "guardian_links": {
      const name = e.personName ?? "a guardian";
      const as = text(data.relationship);
      summary =
        e.action === "insert"
          ? `${actor} linked ${name} to ${learner}${as ? ` as ${as}` : ""}`
          : e.action === "delete"
            ? `${actor} unlinked ${name} from ${learner}`
            : `${actor} changed how ${name} is linked to ${learner}`;
      break;
    }
    case "memberships": {
      const name = e.personName ?? "a staff member";
      const r = role(data.role) ?? "staff";
      if (e.event === "admin_invited" || e.event === "staff_invited") {
        return { summary: `${actor} invited ${name} as ${r}`, changes: [], reason };
      }
      if (e.event === "invite_resent") {
        return { summary: `${actor} re-sent ${possessive(name)} invite`, changes: [], reason };
      }
      summary =
        e.action === "insert"
          ? `${actor} added ${name} as ${r}`
          : changes.length === 1 && changed("role")
            ? `${actor} changed ${possessive(name)} role from ${changes[0]!.from} to ${changes[0]!.to}`
            : changes.length === 1 && changed("status")
              ? `${actor} changed ${possessive(name)} access from ${changes[0]!.from} to ${changes[0]!.to}`
              : `${actor} changed ${possessive(name)} membership`;
      break;
    }
    case "profiles":
      summary = `${actor} changed ${possessive(e.personName ?? "a staff member")} staff details`;
      break;
    case "schools":
      summary =
        e.event === "school_created"
          ? `${actor} created the school ${e.personName ?? ""}`.trim()
          : `${actor} changed the school's colours or logo`;
      if (e.event === "school_created") return { summary, changes: [], reason };
      break;
    case "invites": {
      const name = e.personName ?? "a guardian";
      summary =
        e.event === "parent_invite_accepted"
          ? `${actor} signed up as a parent with the code made for ${name}`
          : `${actor} made a parent sign-up code for ${name}`;
      return { summary, changes: [], reason };
    }
    default:
      return { summary: `${actor} made a change`, changes: [], reason };
  }

  return { summary, changes, reason };
}

/** The listed fields that differ between the old and new row, as words. */
function changesFor(e: AuditEntry): AuditChange[] {
  const fields = FIELDS[e.table] ?? [];
  const out: AuditChange[] = [];
  for (const f of fields) {
    const before = e.oldData ? show(f, e.oldData[f.key]) : null;
    const after = e.newData ? show(f, e.newData[f.key]) : null;
    if (e.oldData && e.newData && before === after) continue;
    if (before == null && after == null) continue;
    out.push({ label: f.label, from: before, to: after });
  }
  return out;
}

function labelOf(table: string, key: string): string | undefined {
  return FIELDS[table]?.find((f) => f.key === key)?.label;
}

function show(field: Field, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (field.format) return field.format(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function markValue(row: Record<string, unknown>): string {
  if (row.status === "absent") return "absent";
  if (row.status === "excused") return "excused";
  return formatNumber(row.score) ?? "blank";
}

function formatNumber(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

function words(value: unknown): string | null {
  return typeof value === "string" && value ? value.replaceAll("_", " ") : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** "Tendai Ncube's"; "Mr Moyo's". */
export function possessive(name: string): string {
  return `${name}'s`;
}
