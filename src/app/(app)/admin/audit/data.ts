import "server-only";

import { forbidden } from "next/navigation";
import { describeAuditEntry, type AuditAction, type AuditLine } from "@/lib/audit/describe";
import type { AuditCursor, AuditFilters } from "@/lib/audit/filters";
import { getActiveSchool, requireArea } from "@/lib/auth/viewer";
import { searchWords } from "@/lib/people/person-input";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for /admin/audit (D35). Through the user-scoped client: the page
 * function public.audit_entries() answers only a school admin or head of
 * the school, as the audit_log policy does.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "audit", "Could not load the audit log. Please try again.");
}

export const AUDIT_PAGE_SIZE = 50;

/** The school admin or head opening the audit log, or 403. */
export async function requireAuditViewer(): Promise<{ schoolId: string; schoolName: string }> {
  const { viewer, school } = await requireArea("audit");
  const active = school ?? (await getActiveSchool(viewer));
  if (!active) forbidden();
  return { schoolId: active.schoolId, schoolName: active.schoolName };
}

export type AuditListItem = { id: number; when: string; term: string | null; line: AuditLine };

export async function loadAuditPage(
  schoolId: string,
  filters: AuditFilters,
  before: AuditCursor | null,
): Promise<{ items: AuditListItem[]; next: AuditCursor | null }> {
  const supabase = await createClient();
  const [result, school] = await Promise.all([
    supabase.rpc("audit_entries", {
      p_school_id: schoolId,
      p_learner_id: filters.learnerId ?? undefined,
      p_class_id: filters.classId ?? undefined,
      p_actor_id: filters.actorId ?? undefined,
      p_from: filters.from ?? undefined,
      p_to: filters.to ?? undefined,
      p_before_at: before?.createdAt,
      p_before_id: before?.id,
      p_limit: AUDIT_PAGE_SIZE + 1,
    }),
    supabase.from("schools").select("timezone").eq("id", schoolId).maybeSingle(),
  ]);
  const found = rows(result);
  const page = found.slice(0, AUDIT_PAGE_SIZE);
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: school.data?.timezone ?? "Africa/Harare",
  });
  const last = page.at(-1);

  return {
    items: page.map((r) => ({
      id: r.id,
      when: when.format(new Date(r.created_at)),
      term: r.term_name ?? null,
      line: describeAuditEntry({
        id: r.id,
        createdAt: r.created_at,
        table: r.table_name,
        action: r.action as AuditAction,
        event: r.event,
        reason: r.reason,
        oldData: asObject(r.old_data),
        newData: asObject(r.new_data),
        actorName: r.actor_name,
        learnerName: r.learner_name,
        learnerNumber: r.learner_number,
        className: r.class_name,
        subjectName: r.subject_name,
        assessmentName: r.assessment_name,
        personName: r.person_name,
        otherClassName: r.other_class_name,
      }),
    })),
    next:
      found.length > AUDIT_PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type Option = { id: string; label: string };

/** Classes of every year (newest year first) and the school's staff, for the filters. */
export async function loadFilterOptions(
  schoolId: string,
): Promise<{ classes: Option[]; staff: Option[] }> {
  const supabase = await createClient();
  const [classes, staff] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, academic_years!inner(label, starts_on)")
      .eq("school_id", schoolId),
    supabase.rpc("school_staff", { p_school_id: schoolId }),
  ]);
  const classRows = rows(classes)
    .map((c) => ({
      id: c.id,
      name: c.name,
      year: c.academic_years.label,
      startsOn: c.academic_years.starts_on,
    }))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.name.localeCompare(b.name));
  const years = new Set(classRows.map((c) => c.year));
  const people = new Map<string, string>();
  for (const s of rows(staff)) if (!people.has(s.user_id)) people.set(s.user_id, s.full_name);

  return {
    classes: classRows.map((c) => ({
      id: c.id,
      label: years.size > 1 ? `${c.name} (${c.year})` : c.name,
    })),
    staff: [...people]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export type LearnerMatch = { id: string; name: string; number: string };

/** The learner a filter names, for its label. */
export async function learnerById(schoolId: string, id: string): Promise<LearnerMatch | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("learners")
    .select("id, first_name, last_name, learner_number")
    .eq("school_id", schoolId)
    .eq("id", id)
    .maybeSingle();
  return data
    ? { id: data.id, name: `${data.first_name} ${data.last_name}`, number: data.learner_number }
    : null;
}

/** Up to 10 learners whose name or number matches every word typed. */
export async function findLearners(schoolId: string, query: string): Promise<LearnerMatch[]> {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const supabase = await createClient();
  let q = supabase
    .from("learners")
    .select("id, first_name, last_name, learner_number")
    .eq("school_id", schoolId);
  for (const word of words) {
    q = q.or(`first_name.ilike.*${word}*,last_name.ilike.*${word}*,learner_number.ilike.*${word}*`);
  }
  return rows(await q.order("last_name").order("first_name").limit(10)).map((l) => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name}`,
    number: l.learner_number,
  }));
}
