"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { parseBrandColors } from "@/lib/branding/brand-colors";
import { BRANDING_BUCKET } from "@/lib/branding/theme";
import {
  LOGO_TYPES,
  checkLogoFile,
  logoObjectPath,
  parseAdminInvite,
  parseNewSchool,
  sniffImageType,
} from "@/lib/platform/school-input";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./form-state";

/**
 * Super-admin console actions (SPEC US-10.1, US-1.5). Each one checks the
 * caller is a platform admin; the writes then go through the user-scoped
 * client, so RLS and the write guards apply as well. The service-role
 * client is used only to create the invitee's Auth account.
 */

const NOT_ALLOWED: FormState = {
  status: "error",
  message: "Only a platform admin can do this.",
  errors: {},
};
const FAILED = (what: string): FormState => ({
  status: "error",
  message: `Could not ${what}. Please try again.`,
  errors: {},
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isPlatformAdmin(): Promise<boolean> {
  return (await getViewer())?.isPlatformAdmin === true;
}

export async function createSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED;
  const parsed = parseNewSchool({
    name: formData.get("name"),
    slug: formData.get("slug"),
    stage: formData.get("stage"),
  });
  if (!parsed.ok) return { status: "error", message: null, errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").insert(parsed.value).select("id").single();
  if (error?.code === "23505") {
    return { status: "error", message: null, errors: { slug: "That slug is already taken." } };
  }
  if (error) return FAILED("create the school");

  revalidatePath("/platform");
  redirect(`/platform/schools/${data.id}`);
}

export async function saveColors(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isPlatformAdmin()) || !UUID_RE.test(schoolId)) return NOT_ALLOWED;
  const parsed = parseBrandColors({
    primaryColor: formData.get("primaryColor"),
    accentColor: formData.get("accentColor"),
  });
  if (!parsed.ok) return { status: "error", message: null, errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .update({
      primary_color: parsed.value.primaryColor,
      accent_color: parsed.value.accentColor,
    })
    .eq("id", schoolId)
    .select("id");
  if (error || data.length !== 1) return FAILED("save the colours");

  revalidatePath("/", "layout");
  return { status: "saved", message: "Colours saved.", errors: {} };
}

export async function uploadLogo(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isPlatformAdmin()) || !UUID_RE.test(schoolId)) return NOT_ALLOWED;
  const file = formData.get("logo");
  const checked = checkLogoFile(file instanceof File ? file : null);
  if (!checked.ok || !(file instanceof File)) {
    return {
      status: "error",
      message: null,
      errors: { logo: checked.ok ? undefined : checked.error },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return {
      status: "error",
      message: null,
      errors: { logo: "Upload a PNG, JPEG or WebP image." },
    };
  }

  const supabase = await createClient();
  const path = logoObjectPath(schoolId, LOGO_TYPES[type], new Date());
  const upload = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (upload.error) return FAILED("upload the logo");

  const { data, error } = await supabase
    .from("schools")
    .update({ logo_path: path })
    .eq("id", schoolId)
    .select("id");
  if (error || data.length !== 1) return FAILED("save the logo");

  revalidatePath("/", "layout");
  return { status: "saved", message: "Logo uploaded.", errors: {} };
}

/**
 * Invites a school's first admin (US-10.1). A new person gets a Supabase
 * Auth invite email and an `invited` membership, activated when they set
 * their password (/auth/confirm, then /welcome). Someone who already has an
 * account is given an active membership straight away. See D14.
 */
export async function inviteSchoolAdmin(
  schoolId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isPlatformAdmin()) || !UUID_RE.test(schoolId)) return NOT_ALLOWED;
  const parsed = parseAdminInvite({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
  });
  if (!parsed.ok) return { status: "error", message: null, errors: parsed.errors };
  const { email, fullName } = parsed.value;

  const supabase = await createClient();
  const [school, admins] = await Promise.all([
    supabase.from("schools").select("id").eq("id", schoolId).maybeSingle(),
    supabase
      .from("memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("role", "school_admin")
      .neq("status", "disabled"),
  ]);
  if (school.error || admins.error || !school.data) return FAILED("send the invite");
  if (admins.data.length > 0) {
    return { status: "error", message: "This school already has an admin.", errors: {} };
  }

  const admin = createAdminClient();
  let userId: string;
  let status: "invited" | "active";

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (invited.data.user) {
    userId = invited.data.user.id;
    status = "invited";
  } else if (invited.error?.code === "email_exists") {
    const existing = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing.error || !existing.data) return FAILED("send the invite");
    userId = existing.data.id;
    status = "active";
  } else {
    return FAILED("send the invite");
  }

  const membership = await supabase
    .from("memberships")
    .insert({ school_id: schoolId, user_id: userId, role: "school_admin", status });
  if (membership.error) return FAILED("add the school admin");

  revalidatePath(`/platform/schools/${schoolId}`);
  return {
    status: "saved",
    message:
      status === "invited"
        ? `Invite sent to ${email}.`
        : `${email} already has an account, so they are now this school's admin.`,
    errors: {},
  };
}
