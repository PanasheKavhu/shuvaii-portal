import "server-only";

import { forbidden } from "next/navigation";
import { getActiveSchool, getViewer, requireArea } from "@/lib/auth/viewer";
import type { ClassCompletion, ClassSubjectCompletion } from "@/lib/marks/completion";
import type { ClassReportStatus, GuardianFilter } from "@/lib/oversight/summary";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { loadCompletion } from "../marks/completion-data";
import { loadAuditPage, type AuditListItem } from "./audit/data";

/**
 * Reads for the overview (US-9.1, D51). Everything goes through the
 * user-scoped client: the oversight functions answer the school admin and
 * head, completion answers a hod for their own class subjects (D36), and
 * the audit log only admin and head (D35). Each section is one set-based
 * call for the whole school, all made at once.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "oversight", "Could not load the overview. Please try again.");
}

export type Overseer = {
  schoolId: string;
  schoolName: string;
  userId: string;
  fullName: string;
  isAdmin: boolean;
  isHead: boolean;
  /** School admin or head: the whole school. Otherwise a hod: their own (D23, D36). */
  isAdminOrHead: boolean;
};

function overseerFrom(
  viewer: { userId: string; fullName: string },
  school: { schoolId: string; schoolName: string; roles: string[] },
): Overseer {
  const isAdmin = school.roles.includes("school_admin");
  const isHead = school.roles.includes("head");
  return {
    schoolId: school.schoolId,
    schoolName: school.schoolName,
    userId: viewer.userId,
    fullName: viewer.fullName,
    isAdmin,
    isHead,
    isAdminOrHead: isAdmin || isHead,
  };
}

/** The school admin, head or hod opening /admin, or 403 (the proxy checked the area too). */
export async function requireOverseer(): Promise<Overseer> {
  const { viewer, school } = await requireArea("admin");
  const active = school ?? (await getActiveSchool(viewer));
  if (!active) forbidden();
  return overseerFrom(viewer, active);
}

/** The same for the search action, which answers with a message instead of a 403. */
export async function overseer(): Promise<Overseer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const school = await getActiveSchool(viewer);
  if (!school) return null;
  const allowed = ["school_admin", "head", "hod"].some((r) => school.roles.includes(r as never));
  return allowed ? overseerFrom(viewer, school) : null;
}

export type OversightCounts = {
  activeLearners: number;
  staff: number;
  guardians: number;
  parentsLinked: number;
  guardiansNeverSignedIn: number;
};

export type Dashboard = {
  classSubjects: ClassSubjectCompletion[];
  classes: ClassCompletion[];
  /** Null for a hod, who sees no school-wide numbers. */
  reports: ClassReportStatus[] | null;
  counts: OversightCounts | null;
  activity: AuditListItem[] | null;
};

export const ACTIVITY_SIZE = 20;

const NO_FILTERS = {
  learnerId: null,
  learnerQuery: "",
  classId: null,
  actorId: null,
  from: null,
  to: null,
};

export async function loadDashboard(o: Overseer, termId: string | null): Promise<Dashboard> {
  const supabase = await createClient();
  const wide = o.isAdminOrHead;
  const [completion, reports, counts, activity] = await Promise.all([
    termId ? loadCompletion(termId) : Promise.resolve({ classSubjects: [], classes: [] }),
    wide && termId ? supabase.rpc("oversight_reports", { p_term_id: termId }) : null,
    wide ? supabase.rpc("oversight_counts", { p_school_id: o.schoolId }) : null,
    wide ? loadAuditPage(o.schoolId, NO_FILTERS, null, ACTIVITY_SIZE) : null,
  ]);
  const count = counts ? rows(counts)[0] : null;
  return {
    ...completion,
    reports: !wide
      ? null
      : reports
        ? rows(reports).map((r) => ({
            classId: r.class_id,
            className: r.class_name,
            classTeacherName: r.class_teacher_name ?? null,
            counts: {
              draft: r.drafts,
              submitted: r.submitted,
              approved: r.approved,
              published: r.published,
              withdrawn: r.withdrawn,
            },
            returned: r.returned,
          }))
        : [],
    counts: count
      ? {
          activeLearners: count.active_learners,
          staff: count.staff,
          guardians: count.guardians,
          parentsLinked: count.parents_linked,
          guardiansNeverSignedIn: count.guardians_never_signed_in,
        }
      : null,
    activity: activity?.items ?? null,
  };
}

export type GuardianRow = {
  id: string;
  name: string;
  phone: string | null;
  hasLogin: boolean;
  lastSignInAt: string | null;
  learners: { id: string; name: string; number: string }[];
};

/** Guardians of active learners who never signed in, or who have a login (admin and head). */
export async function loadGuardians(
  schoolId: string,
  filter: GuardianFilter,
  page: number,
  pageSize: number,
): Promise<{ guardians: GuardianRow[]; total: number }> {
  const supabase = await createClient();
  const found = rows(
    await supabase.rpc("oversight_guardians", {
      p_school_id: schoolId,
      p_filter: filter,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
  );
  return {
    total: found[0]?.total ?? 0,
    guardians: found.map((g) => ({
      id: g.guardian_id,
      name: g.full_name,
      phone: g.phone ?? null,
      hasLogin: g.has_login,
      lastSignInAt: g.last_sign_in_at ?? null,
      learners: Array.isArray(g.learners)
        ? (g.learners as { id: string; name: string; number: string }[])
        : [],
    })),
  };
}
