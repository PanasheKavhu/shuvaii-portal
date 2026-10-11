import "server-only";

import type { TermKind } from "@/lib/setup/calendar";
import { readSections, type ReportSections } from "@/lib/reports/templates";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/** Reads for the report settings page (D43), through the user-scoped client. */

export type TemplateRow = {
  id: string;
  kind: TermKind;
  name: string;
  sections: ReportSections;
  footerText: string;
  commentLabel: string;
};

const KIND_ORDER: TermKind[] = ["term", "vacation", "mock"];

export async function listReportTemplates(schoolId: string): Promise<TemplateRow[]> {
  const supabase = await createClient();
  const data = rowsOrThrow(
    await supabase
      .from("report_templates")
      .select("id, term_kind, name, sections, footer_text, comment_label")
      .eq("school_id", schoolId),
    "report settings",
    "Could not load the report settings. Please try again.",
  );
  return data
    .map((t) => ({
      id: t.id,
      kind: t.term_kind,
      name: t.name,
      sections: readSections(t.sections, t.term_kind),
      footerText: t.footer_text,
      commentLabel: t.comment_label,
    }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** The school's current stamp and head's signature object names. */
export async function getReportAssets(
  schoolId: string,
): Promise<{ stampPath: string | null; headSignaturePath: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("stamp_path, head_signature_path")
    .eq("id", schoolId)
    .maybeSingle();
  return {
    stampPath: data?.stamp_path ?? null,
    headSignaturePath: data?.head_signature_path ?? null,
  };
}
