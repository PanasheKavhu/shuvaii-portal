import { isSameOrigin, parseExportForm } from "@/lib/exports/input";
import { commentsSheet, exportFileName, learnersSheet, marksSheet } from "@/lib/exports/sheets";
import { xlsxStream } from "@/lib/people/xlsx-write";
import { requireExporter, runExport } from "../data";

/**
 * US-9.4: one Excel export, made on the server and streamed to the school
 * admin (D52). A POST from the exports page's forms, so a link preview or
 * prefetch can never make one. The database checks the caller, reads the
 * rows and records the export in the audit log in one call; the file is
 * never stored. Problems go back to the page as `?error=`.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers, request.url)) {
    return new Response("Not allowed", { status: 403 });
  }
  const exporter = await requireExporter();
  const form = parseExportForm(await request.formData());
  const back = (error: string) =>
    Response.redirect(new URL(`/admin/exports?error=${error}`, request.url), 303);
  if (!form) return back("choose");

  const result = await runExport(
    form.kind === "learners" ? { kind: "learners", schoolId: exporter.schoolId } : form,
  );
  if (!result.ok) {
    if (result.error === "not-allowed") return new Response("Not allowed", { status: 403 });
    return back(result.error);
  }

  const e = result.export;
  const today = new Date().toISOString().slice(0, 10);
  const { sheet, name } =
    e.kind === "learners"
      ? {
          sheet: learnersSheet(e.doc),
          name: exportFileName(["learners and guardians", exporter.schoolName, today]),
        }
      : e.kind === "marks"
        ? {
            sheet: marksSheet(e.doc),
            name: exportFileName(["marks", e.doc.class_name, e.doc.term_name, e.doc.year_label]),
          }
        : {
            sheet: commentsSheet(e.doc),
            name: exportFileName(["comments", e.doc.class_name, e.doc.term_name, e.doc.year_label]),
          };

  return new Response(xlsxStream(sheet), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
