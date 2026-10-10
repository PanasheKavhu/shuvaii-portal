/**
 * Role areas, home pages and navigation (SPEC US-1.1, US-1.8). Pure: the
 * caller passes the roles the viewer holds in their active school.
 *
 * Each area is one top-level route. A person sees a menu entry for every
 * area one of their roles may use, and lands on the first one in AREAS
 * order, so a teacher who is also a parent lands on their classes.
 */
export const APP_ROLES = ["school_admin", "head", "hod", "teacher", "parent", "learner"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type Area = {
  href: string;
  label: string;
  /** School roles that may use the area; empty for platform-only areas. */
  roles: readonly AppRole[];
  /** Roles that get a menu entry, when not every role in `roles` should. */
  menuRoles?: readonly AppRole[];
  platformOnly?: boolean;
};

export const AREAS = {
  admin: { href: "/admin", label: "School admin", roles: ["school_admin"] },
  head: { href: "/head", label: "Head's office", roles: ["head"] },
  department: { href: "/department", label: "Department", roles: ["hod"] },
  // Heads of department teach too (D20).
  teaching: { href: "/teaching", label: "My classes", roles: ["teacher", "hod"] },
  // Assessments and marks grids (D32). Teachers reach their own from My
  // classes; school admin and head open any class subject's from the menu.
  marks: {
    href: "/marks",
    label: "Marks",
    roles: ["school_admin", "head", "hod", "teacher"],
    menuRoles: ["school_admin", "head"],
  },
  // What is still missing for the term (US-4.8, D36): every class subject
  // for school admin and head, a teacher's own for a teacher or hod.
  completion: {
    href: "/marks/completion",
    label: "Completion",
    roles: ["school_admin", "head", "hod", "teacher"],
  },
  // The school's audit log (D35). Inside /admin, but heads may open it too.
  audit: { href: "/admin/audit", label: "Audit log", roles: ["school_admin", "head"] },
  children: { href: "/children", label: "My children", roles: ["parent"] },
  myReports: { href: "/my-reports", label: "My reports", roles: ["learner"] },
  platform: { href: "/platform", label: "Platform", roles: [], platformOnly: true },
} as const satisfies Record<string, Area>;

export type AreaKey = keyof typeof AREAS;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function canUseArea(
  area: Area,
  roles: readonly AppRole[],
  isPlatformAdmin: boolean,
): boolean {
  if (area.platformOnly) return isPlatformAdmin;
  return area.roles.some((r) => roles.includes(r));
}

/** Menu entries for this viewer, in display order. */
export function navFor(roles: readonly AppRole[], isPlatformAdmin: boolean): Area[] {
  return Object.values(AREAS as Record<AreaKey, Area>).filter((area) =>
    canUseArea({ ...area, roles: area.menuRoles ?? area.roles }, roles, isPlatformAdmin),
  );
}

/** Where to send the viewer after sign in, or null if they have nowhere to go. */
export function homeFor(roles: readonly AppRole[], isPlatformAdmin: boolean): string | null {
  return navFor(roles, isPlatformAdmin)[0]?.href ?? null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  school_admin: "School admin",
  head: "Head",
  hod: "Head of department",
  teacher: "Teacher",
  parent: "Parent",
  learner: "Learner",
};

export function roleLabel(role: AppRole): string {
  return ROLE_LABELS[role];
}
