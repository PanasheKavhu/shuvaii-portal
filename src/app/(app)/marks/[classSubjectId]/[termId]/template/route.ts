import { marksTemplateRows } from "@/lib/marks/upload";
import { toCsvLine } from "@/lib/people/csv";
import { uploadContentType } from "@/lib/people/upload";
import { writeXlsx } from "@/lib/people/xlsx-write";
import { getLockState, loadClassSubjectPage, loadUploadContext } from "../../../data";

/**
 * US-4.3: the marks upload template for one class subject and term, as
 * Excel (.xlsx, the default) or CSV (`?format=csv`). One row per learner
 * who takes the subject, one column per assessment with its maximum, filled
 * with the marks already saved. Same access as the grid (D32).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/marks/[classSubjectId]/[termId]/template">,
) {
  const { classSubjectId, termId } = await params;
  const { actor, cst } = await loadClassSubjectPage(classSubjectId, termId);
  const lock = await getLockState(cst.classSubjectId, cst.term.id);
  const rows = marksTemplateRows(await loadUploadContext(actor, cst, lock));

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const base = `${cst.subjectName} ${cst.className} ${cst.term.name} marks`
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const body =
    format === "csv"
      ? new TextEncoder().encode(`﻿${rows.map(toCsvLine).join("\r\n")}\r\n`)
      : writeXlsx({
          name: `${cst.subjectName} ${cst.className}`,
          rows,
          widths: [16, 28, ...rows[0]!.slice(2).map((h) => Math.max(12, h.length + 2))],
        });

  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": uploadContentType(format),
      "Content-Disposition": `attachment; filename="${base}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
