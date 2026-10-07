import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SchoolSummary = {
  id: string;
  name: string;
  slug: string;
  stage: "primary" | "secondary" | "combined";
  status: string;
  logoPath: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

const SCHOOL_COLUMNS = "id, name, slug, stage, status, logo_path, primary_color, accent_color";

function toSummary(row: {
  id: string;
  name: string;
  slug: string;
  stage: SchoolSummary["stage"];
  status: string;
  logo_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
}): SchoolSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    stage: row.stage,
    status: row.status,
    logoPath: row.logo_path,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
  };
}

/** Every school, for the console list. RLS lets only platform admins see them all. */
export async function listSchools(): Promise<SchoolSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").select(SCHOOL_COLUMNS).order("name");
  if (error) throw new Error("Could not load schools");
  return data.map(toSummary);
}

export async function getSchool(id: string): Promise<SchoolSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load the school");
  return data ? toSummary(data) : null;
}

export type SchoolAdmin = {
  membershipId: string;
  fullName: string | null;
  email: string | null;
  status: string;
};

/**
 * The school's admins with name and email. Memberships come through RLS;
 * names and emails need the service role, because platform admins have no
 * read of profiles (D5). Only school_admin profiles of this one school are
 * read, so the console can show who was invited (D14).
 */
export async function listSchoolAdmins(schoolId: string): Promise<SchoolAdmin[]> {
  const supabase = await createClient();
  const memberships = await supabase
    .from("memberships")
    .select("id, user_id, status")
    .eq("school_id", schoolId)
    .eq("role", "school_admin")
    .order("created_at");
  if (memberships.error) throw new Error("Could not load school admins");
  if (memberships.data.length === 0) return [];

  const profiles = await createAdminClient()
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      memberships.data.map((m) => m.user_id),
    );
  if (profiles.error) throw new Error("Could not load school admins");

  return memberships.data.map((m) => {
    const profile = profiles.data.find((p) => p.id === m.user_id);
    return {
      membershipId: m.id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      status: m.status,
    };
  });
}
