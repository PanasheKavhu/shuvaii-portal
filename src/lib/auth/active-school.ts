import type { SchoolBranding } from "@/lib/branding/theme";
import type { AppRole } from "./roles";

/** Name of the cookie holding the school a multi-school user chose (US-1.1). */
export const SCHOOL_COOKIE = "sp_school";

export type SchoolMembership = {
  schoolId: string;
  schoolName: string;
  roles: AppRole[];
  branding: SchoolBranding;
};

/**
 * The school the viewer is working in. The cookie only counts if it names
 * one of their active schools; a single-school user needs no cookie. Null
 * means a multi-school user still has to choose (or the user has no school).
 */
export function pickActiveSchool(
  schools: readonly SchoolMembership[],
  cookieValue: string | undefined,
): SchoolMembership | null {
  const chosen = schools.find((s) => s.schoolId === cookieValue);
  if (chosen) return chosen;
  return schools.length === 1 ? schools[0] : null;
}

/** Groups membership rows (one per role) into one entry per school, sorted by name. */
export function groupMemberships(
  rows: readonly {
    schoolId: string;
    schoolName: string;
    role: AppRole;
    branding: SchoolBranding;
  }[],
): SchoolMembership[] {
  const bySchool = new Map<string, SchoolMembership>();
  for (const row of rows) {
    const school = bySchool.get(row.schoolId) ?? {
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      roles: [],
      branding: row.branding,
    };
    if (!school.roles.includes(row.role)) school.roles.push(row.role);
    bySchool.set(row.schoolId, school);
  }
  return [...bySchool.values()].sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}
