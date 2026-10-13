import { pickActiveSchool, type SchoolMembership } from "./active-school";
import { AREAS, canUseArea, type Area, type AreaKey } from "./roles";
import { secondStepPending, type Assurance } from "./two-factor";

/**
 * The role area a path belongs to, or null for pages outside every area.
 * The most specific area wins, so /admin/audit is the audit area, not admin.
 */
export function areaForPath(pathname: string): AreaKey | null {
  let found: AreaKey | null = null;
  for (const [key, area] of Object.entries(AREAS) as [AreaKey, Area][]) {
    const matches = pathname === area.href || pathname.startsWith(`${area.href}/`);
    if (matches && (!found || area.href.length > AREAS[found].href.length)) found = key;
  }
  return found;
}

export type AccessDecision =
  | { kind: "allow"; school: SchoolMembership | null }
  | { kind: "sign-in" }
  | { kind: "choose-school" }
  | { kind: "two-factor" }
  | { kind: "forbidden" };

/**
 * Who may open a role area (US-1.8). Used by the proxy, before the page
 * renders, and again by each page through requireArea(). Pure.
 *
 * A super admin, school admin or head whose session has not passed the
 * second step (aal1) opens no area at all until they do, or set it up
 * (D54); the database refuses their roles too.
 */
export function decideAreaAccess(
  key: AreaKey,
  viewer: {
    isPlatformAdmin: boolean;
    schools: readonly SchoolMembership[];
    assurance?: Assurance | null;
  } | null,
  schoolCookie: string | undefined,
): AccessDecision {
  if (!viewer) return { kind: "sign-in" };
  if (secondStepPending(viewer)) return { kind: "two-factor" };
  const area: Area = AREAS[key];
  const school = pickActiveSchool(viewer.schools, schoolCookie);

  if (area.platformOnly) {
    return viewer.isPlatformAdmin ? { kind: "allow", school } : { kind: "forbidden" };
  }
  if (!school) return viewer.schools.length > 1 ? { kind: "choose-school" } : { kind: "forbidden" };
  return canUseArea(area, school.roles, viewer.isPlatformAdmin)
    ? { kind: "allow", school }
    : { kind: "forbidden" };
}
