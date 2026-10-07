import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { groupMemberships, type SchoolMembership } from "./active-school";
import { isAppRole } from "./roles";

export type Access = {
  fullName: string;
  isPlatformAdmin: boolean;
  /** Active memberships in active schools, one entry per school. */
  schools: SchoolMembership[];
};

/**
 * Loads what a signed-in user may reach, through a client signed in as
 * them, so RLS decides what is visible. Shared by the proxy and pages.
 */
export async function loadAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Access> {
  const [profile, memberships, platformAdmin] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "role, school_id, schools!inner(name, status, logo_path, primary_color, accent_color)",
      )
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error || memberships.error || platformAdmin.error) {
    throw new Error("Could not load the signed-in user's access");
  }

  const rows = memberships.data
    .filter((m) => m.schools.status === "active" && isAppRole(m.role))
    .map((m) => ({
      schoolId: m.school_id,
      schoolName: m.schools.name,
      role: m.role,
      branding: {
        logoPath: m.schools.logo_path,
        primaryColor: m.schools.primary_color,
        accentColor: m.schools.accent_color,
      },
    }));

  return {
    fullName: profile.data?.full_name ?? "",
    isPlatformAdmin: platformAdmin.data !== null,
    schools: groupMemberships(rows),
  };
}
