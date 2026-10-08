import "server-only";

import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SCHOOL_COOKIE, pickActiveSchool, type SchoolMembership } from "./active-school";
import { mustChangePin } from "./learner-pin";
import { loadAccess, type Access } from "./load-access";
import { homeFor, type AreaKey } from "./roles";
import { decideAreaAccess } from "./route-access";

export type Viewer = Access & {
  userId: string;
  /** A learner whose PIN an admin set must choose their own first (US-1.2). */
  mustChangePin?: boolean;
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
  if (!user) return null;
  return {
    ...(await loadViewer(supabase, user.id)),
    mustChangePin: mustChangePin(user.app_metadata),
  };
});

/** Loads a viewer with a client already signed in as `userId` (used right after sign in). */
export async function loadViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Viewer> {
  return { userId, ...(await loadAccess(supabase, userId)) };
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
 * Guards a role area (US-1.8). The proxy already applies the same rule
 * before rendering; pages check again so a page is never reachable through
 * a path the proxy matcher misses.
 */
export async function requireArea(
  key: AreaKey,
): Promise<{ viewer: Viewer; school: SchoolMembership | null }> {
  const viewer = await requireViewer();
  if (viewer.mustChangePin) redirect("/change-pin");
  const cookieStore = await cookies();
  const decision = decideAreaAccess(key, viewer, cookieStore.get(SCHOOL_COOKIE)?.value);

  switch (decision.kind) {
    case "allow":
      return { viewer, school: decision.school };
    case "sign-in":
      redirect("/sign-in");
    case "choose-school":
      redirect("/select-school");
    case "forbidden":
      forbidden();
  }
}
