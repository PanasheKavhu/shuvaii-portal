import { parseCsv } from "./csv";
import { XlsxError, readXlsx, type XlsxCell } from "./xlsx";

/**
 * Turns an uploaded import file into rows of cells (SPEC US-3.1, US-3.2).
 * Pure: bytes in, rows or a readable error out. The file type is decided
 * by its content, not its name: a zip is an Excel workbook, anything else
 * must be text (CSV).
 */

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export type UploadKind = "csv" | "xlsx";
export type UploadRead =
  { ok: true; kind: UploadKind; rows: XlsxCell[][] } | { ok: false; error: string };

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function uploadContentType(kind: UploadKind): string {
  return kind === "xlsx" ? XLSX_TYPE : "text/csv";
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Old binary Excel (.xls) files start with the OLE2 signature. */
function isOldExcel(bytes: Uint8Array): boolean {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/** UTF-8, or Windows-1252 for CSVs saved by older Excel. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function readUpload(bytes: Uint8Array): UploadRead {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > IMPORT_MAX_BYTES) {
    return { ok: false, error: "The file is larger than 5 MB. Split it into smaller files." };
  }
  if (isOldExcel(bytes)) {
    return {
      ok: false,
      error: "This is an old .xls file. In Excel, save it as .xlsx or CSV and upload that.",
    };
  }
  if (isZip(bytes)) {
    try {
      return { ok: true, kind: "xlsx", rows: readXlsx(bytes) };
    } catch (e) {
      const why = e instanceof XlsxError ? ` (${e.message})` : "";
      return { ok: false, error: `Could not read this Excel file${why}. Save it again as .xlsx.` };
    }
  }
  const text = decodeText(bytes);
  // A binary file that is neither: NUL bytes never appear in a CSV.
  if (text.includes("\u0000")) {
    return { ok: false, error: "Upload a CSV or Excel (.xlsx) file." };
  }
  return { ok: true, kind: "csv", rows: parseCsv(text) };
}
