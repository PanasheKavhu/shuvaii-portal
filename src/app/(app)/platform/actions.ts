"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  findOrCreateAccounts,
  resendProblem,
  sendInviteEmail,
  unprovedMessage,
} from "@/lib/auth/staff-accounts";
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
 * client is used only for the invitee's Auth account and invite email
 * (src/lib/auth/staff-accounts.ts, shared with /admin/people).
 *
 * Audit (D18): creating a school and changing its colours or logo are
 * recorded by a trigger on `schools`; invites are recorded here through
 * `log_invite_event()`, since an email leaves no row change of its own.
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
 * Invites a school's first admin (US-10.1). The membership starts
 * `invited`. A new person gets a Supabase Auth invite email and accepts
 * by setting their password (/auth/confirm, then /welcome); someone who
 * already has an account accepts on /welcome when they next sign in. See
 * D14, D27.
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

  const found = await findOrCreateAccounts([{ email, fullName }]);
  if (!found.ok) {
    return found.unproved
      ? { status: "error", message: null, errors: { email: unprovedMessage(found.unproved) } }
      : FAILED("send the invite");
  }
  const account = found.accounts[0]!;

  const membership = await supabase
    .from("memberships")
    .insert({
      school_id: schoolId,
      user_id: account.userId,
      role: "school_admin",
      status: "invited",
    })
    .select("id")
    .single();
  if (membership.error) return FAILED("add the school admin");
  revalidatePath(`/platform/schools/${schoolId}`);

  if (account.hasAccount) {
    return logInviteEvent(
      membership.data.id,
      "admin_invited",
      `${email} already has an account, so they will be asked to accept when they next sign in.`,
    );
  }
  if ((await sendInviteEmail(email, fullName)) !== "sent") {
    return {
      status: "error",
      message: `${email} was added, but the invite email could not be sent. Use Resend invite.`,
      errors: {},
    };
  }
  const message = `Invite sent to ${email}.`;
  return logInviteEvent(membership.data.id, "admin_invited", message);
}

/**
 * Sends a school admin's invite email again while their membership is still
 * `invited` (D14). Auth issues a fresh link; the old one stops working.
 */
export async function resendInvite(schoolId: string, membershipId: string): Promise<FormState> {
  if (!(await isPlatformAdmin()) || !UUID_RE.test(schoolId) || !UUID_RE.test(membershipId)) {
    return NOT_ALLOWED;
  }

  const supabase = await createClient();
  const pending = await supabase
    .from("memberships")
    .select("id, user_id")
    .eq("id", membershipId)
    .eq("school_id", schoolId)
    .eq("role", "school_admin")
    .eq("status", "invited")
    .maybeSingle();
  if (pending.error) return FAILED("resend the invite");
  if (!pending.data) {
    revalidatePath(`/platform/schools/${schoolId}`);
    return { status: "error", message: "This invite is no longer waiting.", errors: {} };
  }

  const profile = await createAdminClient()
    .from("profiles")
    .select("email")
    .eq("id", pending.data.user_id)
    .maybeSingle();
  if (profile.error || !profile.data?.email) return FAILED("resend the invite");
  const email = profile.data.email;

  const outcome = await sendInviteEmail(email);
  if (outcome !== "sent")
    return { status: "error", message: resendProblem(outcome, email), errors: {} };

  return logInviteEvent(pending.data.id, "invite_resent", `Invite sent again to ${email}.`);
}

/**
 * Records an invite console event (D18). The email has already gone, so a
 * failure here is reported beside the success rather than as a retry.
 */
async function logInviteEvent(
  membershipId: string,
  event: "admin_invited" | "invite_resent",
  message: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_invite_event", {
    p_membership_id: membershipId,
    p_event: event,
  });
  if (error) {
    return {
      status: "error",
      message: `${message} It could not be recorded in the audit log.`,
      errors: {},
    };
  }
  return { status: "saved", message, errors: {} };
}
