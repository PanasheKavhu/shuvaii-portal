"use server";

import { revalidatePath } from "next/cache";
import { schoolAdminContext } from "@/lib/auth/viewer";
import { parsePrivacyContact } from "@/lib/platform/school-input";
import { createClient } from "@/lib/supabase/server";
import { failed, notAllowed, saved, type FormState } from "../../../platform/form-state";

/**
 * The school admin keeps the school's privacy notice contact (Q20; D57),
 * which /privacy?school=<slug> prints. The D3 guard lets a school admin
 * change it; the write goes through the user-scoped client, so RLS applies.
 */
export async function saveSchoolPrivacyContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId) return notAllowed("a school admin");
  const parsed = parsePrivacyContact({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.ok) return failed(null, parsed.errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .update({ privacy_contact_name: parsed.value.name, privacy_contact_email: parsed.value.email })
    .eq("id", schoolId)
    .select("id");
  if (error || data.length !== 1)
    return failed("Could not save the privacy contact. Please try again.");

  revalidatePath("/admin/setup/privacy");
  return saved("Privacy contact saved.");
}
