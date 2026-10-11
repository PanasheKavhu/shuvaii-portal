"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/db-errors";
import { shareLinkUrl } from "@/lib/reports/portal";
import { portalUrl } from "@/lib/reports/portal-url";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, saved, type FormState } from "./platform/form-state";

/**
 * Share links for a published report (US-7.3; D47). The database makes the
 * token, stores only its hash and checks that the caller is the learner or
 * a linked parent; these validate input and say the answer in plain words.
 */

const TRY_AGAIN = "Could not make the link. Check your connection and try again.";
const FAMILY_ONLY = "Only the learner or their parent can share this report.";

export type ShareState = FormState & { link?: string };

function revalidate(reportId: string) {
  revalidatePath(`/children/reports/${reportId}`);
  revalidatePath(`/my-reports/${reportId}`);
}

/** Makes a 7-day link and returns it once; it cannot be shown again. */
export async function createShareLink(reportId: string): Promise<ShareState> {
  if (!isUuid(reportId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_report_share", { p_report_id: reportId });
  const made = data?.[0];
  if (error || !made) {
    return failed(
      error ? dbErrorMessage(error, { notAllowed: FAMILY_ONLY, fallback: TRY_AGAIN }) : TRY_AGAIN,
    );
  }
  revalidate(reportId);
  return {
    ...saved("Link ready. Anyone with it can open the PDF for 7 days."),
    link: shareLinkUrl(await portalUrl(), made.token),
  };
}

/** Revokes one of the viewer's own links. */
export async function revokeShareLink(reportId: string, shareId: string): Promise<FormState> {
  if (!isUuid(reportId) || !isUuid(shareId)) return failed(TRY_AGAIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_report_share", { p_share_id: shareId });
  if (error) {
    return failed(
      dbErrorMessage(error, {
        notAllowed: "Only the person who made a link can revoke it.",
        fallback: "Could not revoke the link. Check your connection and try again.",
      }),
    );
  }
  revalidate(reportId);
  return saved("Link revoked. It no longer opens.");
}
