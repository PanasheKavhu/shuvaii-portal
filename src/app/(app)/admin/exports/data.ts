import "server-only";

import { forbidden } from "next/navigation";
import { getActiveSchool, requireArea } from "@/lib/auth/viewer";
import type { CommentsDoc, ExportKind, LearnersDoc, MarksDoc } from "@/lib/exports/sheets";
import { rowsOrThrow } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for /admin/exports (US-9.4, D52). Through the user-scoped client:
 * the export functions answer only the school's admin and write the audit
 * row themselves.
 */

function rows<T>(result: { data: T[] | null; error: { code?: string } | null }): T[] {
  return rowsOrThrow(result, "exports", "Could not load the exports page. Please try again.");
}

export type Exporter = { schoolId: string; schoolName: string };

/** The school admin opening the exports, or 403 (the proxy checked the area too). */
export async function requireExporter(): Promise<Exporter> {
  const { viewer, school } = await requireArea("exports");
  const active = school ?? (await getActiveSchool(viewer));
  if (!active || !active.roles.includes("school_admin")) forbidden();
  return { schoolId: active.schoolId, schoolName: active.schoolName };
}

export type YearChoice = { id: string; label: string; isCurrent: boolean };
export type Choice = { id: string; name: string };

/**
 * The school's years (newest first), the classes and terms of the one
 * shown, and the term to offer first: the latest that has started.
 */
export async function loadExportChoices(
  schoolId: string,
  wantedYear: string | string[] | undefined,
): Promise<{
  years: YearChoice[];
  year: YearChoice | null;
  classes: Choice[];
  terms: Choice[];
  termId: string | null;
}> {
  const supabase = await createClient();
  const years = rows(
    await supabase
      .from("academic_years")
      .select("id, label, is_current")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
  ).map((y) => ({ id: y.id, label: y.label, isCurrent: y.is_current }));
  const year = years.find((y) => y.id === wantedYear) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return { years, year: null, classes: [], terms: [], termId: null };

  const [classes, terms] = await Promise.all([
    supabase.from("classes").select("id, name").eq("academic_year_id", year.id).order("name"),
    supabase
      .from("terms")
      .select("id, name, starts_on")
      .eq("academic_year_id", year.id)
      .order("starts_on"),
  ]);
  const termRows = rows(terms);
  const today = new Date().toISOString().slice(0, 10);
  const started = termRows.filter((t) => t.starts_on <= today).at(-1) ?? termRows[0];
  return {
    years,
    year,
    classes: rows(classes),
    terms: termRows.map((t) => ({ id: t.id, name: t.name })),
    termId: started?.id ?? null,
  };
}

export type ExportRequest =
  | { kind: "learners"; schoolId: string }
  | { kind: "marks" | "comments"; classId: string; termId: string };

export type ExportDoc =
  | { kind: "learners"; doc: LearnersDoc }
  | { kind: "marks"; doc: MarksDoc }
  | { kind: "comments"; doc: CommentsDoc };

export type ExportResult =
  { ok: true; export: ExportDoc } | { ok: false; error: "not-allowed" | "wrong-term" | "failed" };

/**
 * Runs one export. The database checks the caller is the school's admin,
 * reads everything the file holds and writes the audit row in one call.
 */
export async function runExport(req: ExportRequest): Promise<ExportResult> {
  const supabase = await createClient();
  const result =
    req.kind === "learners"
      ? await supabase.rpc("export_learners", { p_school_id: req.schoolId })
      : await supabase.rpc(req.kind === "marks" ? "export_class_marks" : "export_class_comments", {
          p_class_id: req.classId,
          p_term_id: req.termId,
        });
  if (result.error) {
    if (result.error.code === "42501") return { ok: false, error: "not-allowed" };
    if (result.error.code === "22023") return { ok: false, error: "wrong-term" };
    console.error("exports: export failed", result.error.code);
    return { ok: false, error: "failed" };
  }
  const kind: ExportKind = req.kind;
  return { ok: true, export: { kind, doc: result.data } as ExportDoc };
}
