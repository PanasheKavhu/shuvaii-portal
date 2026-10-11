"use server";

import { revalidatePath } from "next/cache";
import { schoolAdminContext } from "@/lib/auth/viewer";
import { dbErrorMessage } from "@/lib/db-errors";
import { LOGO_TYPES, checkLogoFile, sniffImageType } from "@/lib/platform/school-input";
import {
  REPORT_ASSETS,
  REPORT_SECTIONS,
  isReportAsset,
  parseTemplate,
  reportAssetPath,
} from "@/lib/reports/templates";
import { REPORT_ASSETS_BUCKET } from "@/lib/reports/storage";
import { isTermKind, TERM_KIND_LABELS } from "@/lib/setup/calendar";
import { createClient } from "@/lib/supabase/server";
import { failed, notAllowed, saved, type FormState } from "../../../platform/form-state";

/**
 * Report settings (D43): one template per term kind, and the stamp and
 * head's signature images. School admin only; writes go through the
 * user-scoped client, so RLS, the template checks and the storage policy
 * apply as well.
 */

const NOT_ALLOWED = notAllowed("a school admin");
const PATH = "/admin/setup/reports";

export async function saveReportTemplate(
  kind: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isTermKind(kind)) return NOT_ALLOWED;
  const parsed = parseTemplate(
    {
      sections: Object.fromEntries(REPORT_SECTIONS.map(({ key }) => [key, formData.get(key)])),
      footerText: formData.get("footerText"),
      commentLabel: formData.get("commentLabel"),
    },
    kind,
  );
  if (!parsed.ok) return failed("Check the report settings.", parsed.errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_templates")
    .update({
      sections: parsed.value.sections,
      footer_text: parsed.value.footerText,
      comment_label: parsed.value.commentLabel,
    })
    .eq("school_id", schoolId)
    .eq("term_kind", kind)
    .select("id");
  if (error || data.length !== 1) {
    return failed(
      error
        ? dbErrorMessage(error, {
            notAllowed: NOT_ALLOWED.message!,
            fallback: "Could not save the report settings. Please try again.",
          })
        : "Could not save the report settings. Please try again.",
    );
  }
  revalidatePath(PATH);
  return saved(`${TERM_KIND_LABELS[kind]} report settings saved.`);
}

/**
 * Uploads the stamp or the head's signature to the private report-assets
 * bucket under a new name (the old image stays) and points the school at
 * it. Checked like the logo (D15): PNG, JPEG or WebP by its first bytes, at
 * most 1 MB.
 */
export async function uploadReportAsset(
  asset: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schoolId = (await schoolAdminContext())?.schoolId;
  if (!schoolId || !isReportAsset(asset)) return NOT_ALLOWED;
  const { label, column } = REPORT_ASSETS[asset];

  const file = formData.get("image");
  const checked = checkLogoFile(file instanceof File ? file : null, "The image");
  if (!checked.ok || !(file instanceof File)) {
    return failed(null, { image: checked.ok ? undefined : checked.error });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return failed(null, { image: "Upload a PNG, JPEG or WebP image." });

  const supabase = await createClient();
  const path = reportAssetPath(schoolId, asset, LOGO_TYPES[type], new Date());
  const upload = await supabase.storage
    .from(REPORT_ASSETS_BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false });
  if (upload.error) return failed(`Could not upload the ${label.toLowerCase()}. Please try again.`);

  const { data, error } = await supabase
    .from("schools")
    .update(column === "stamp_path" ? { stamp_path: path } : { head_signature_path: path })
    .eq("id", schoolId)
    .select("id");
  if (error || data.length !== 1) {
    return failed(`Could not save the ${label.toLowerCase()}. Please try again.`);
  }
  revalidatePath(PATH);
  return saved(`${label} uploaded.`);
}
