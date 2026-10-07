"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { homeFor } from "@/lib/auth/roles";
import { requireViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** Picks the school a multi-school user works in (US-1.1) and goes to its home. */
export async function chooseSchool(formData: FormData) {
  const viewer = await requireViewer();
  const schoolId = formData.get("schoolId");
  const school = viewer.schools.find((s) => s.schoolId === schoolId);
  if (!school) redirect("/select-school");

  const cookieStore = await cookies();
  cookieStore.set(SCHOOL_COOKIE, school.schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(homeFor(school.roles, viewer.isPlatformAdmin) ?? "/no-access");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SCHOOL_COOKIE);
  redirect("/sign-in");
}
