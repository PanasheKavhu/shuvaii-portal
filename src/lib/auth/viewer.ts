import "server-only";

import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  SCHOOL_COOKIE,
  groupMemberships,
  pickActiveSchool,
  type SchoolMembership,
} from "./active-school";
import { AREAS, canUseArea, homeFor, isAppRole, type AreaKey } from "./roles";

export type Viewer = {
  userId: string;
  fullName: string;
  isPlatformAdmin: boolean;
  /** Active memberships in active schools, one entry per school. */
  schools: SchoolMembership[];
};

/**
 * The signed-in person and their schools, or null. Reads through the
 * user-scoped client, so RLS decides what is visible. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? loadViewer(supabase, user.id) : null;
});

/** Loads a viewer with a client already signed in as `userId` (used right after sign in). */
export async function loadViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Viewer> {
  const [profile, memberships, platformAdmin] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, school_id, schools!inner(name, status)")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error || memberships.error || platformAdmin.error) {
    throw new Error("Could not load the signed-in user's access");
  }

  const rows = (memberships.data ?? [])
    .filter((m) => m.schools.status === "active" && isAppRole(m.role))
    .map((m) => ({ schoolId: m.school_id, schoolName: m.schools.name, role: m.role }));

  return {
    userId,
    fullName: profile.data?.full_name ?? "",
    isPlatformAdmin: platformAdmin.data !== null,
    schools: groupMemberships(rows),
  };
}

/** The viewer's current school (from the school cookie), or null if they must choose. */
export async function getActiveSchool(viewer: Viewer): Promise<SchoolMembership | null> {
  const cookieStore = await cookies();
  return pickActiveSchool(viewer.schools, cookieStore.get(SCHOOL_COOKIE)?.value);
}

/** Where a signed-in viewer should go from "/" or after choosing a school. */
export async function landingPathFor(viewer: Viewer): Promise<string> {
  const school = await getActiveSchool(viewer);
  if (school) return homeFor(school.roles, viewer.isPlatformAdmin) ?? "/no-access";
  if (viewer.schools.length > 1) return "/select-school";
  return homeFor([], viewer.isPlatformAdmin) ?? "/no-access";
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}

/**
 * Guards a role area (US-1.8): signed out goes to sign in, a multi-school
 * user who has not chosen goes to the picker, anyone else without a role
 * for the area gets the "not allowed" page (HTTP 403).
 */
export async function requireArea(
  key: AreaKey,
): Promise<{ viewer: Viewer; school: SchoolMembership | null }> {
  const viewer = await requireViewer();
  const area = AREAS[key];

  if ("platformOnly" in area && area.platformOnly) {
    if (!viewer.isPlatformAdmin) forbidden();
    return { viewer, school: await getActiveSchool(viewer) };
  }

  const school = await getActiveSchool(viewer);
  if (!school) {
    if (viewer.schools.length > 1) redirect("/select-school");
    forbidden();
  }
  if (!canUseArea(area, school.roles, viewer.isPlatformAdmin)) forbidden();
  return { viewer, school };
}
