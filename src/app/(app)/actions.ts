"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { homeFor } from "@/lib/auth/roles";
import { rememberSchool } from "@/lib/auth/school-cookie";
import { requireViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** Picks the school a multi-school user works in (US-1.1) and goes to its home. */
export async function chooseSchool(formData: FormData) {
  const viewer = await requireViewer();
  const schoolId = formData.get("schoolId");
  const school = viewer.schools.find((s) => s.schoolId === schoolId);
  if (!school) redirect("/select-school");

  await rememberSchool(school.schoolId);
  redirect(homeFor(school.roles, viewer.isPlatformAdmin) ?? "/no-access");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SCHOOL_COOKIE);
  redirect("/sign-in");
}
