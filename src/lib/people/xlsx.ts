import { inflateRawSync } from "node:zlib";

/**
 * Reads the first worksheet of an Excel .xlsx file into rows of cells, for
 * the staff and learner imports (SPEC US-3.1, US-3.2). Pure apart from
 * using zlib to decompress; no dependency (D24).
 *
 * An .xlsx file is a zip of XML parts. This reads only what an import
 * needs: the first sheet's cell values, with shared and inline strings,
 * numbers and booleans. Dates come back as Excel serial numbers (Excel
 * stores them that way); the date field parser converts them. Formulas give
 * their cached value. Formatting, other sheets and zip64 are ignored.
 */

export type XlsxCell = string | number | boolean | null;

export class XlsxError extends Error {}

/** Refuse anything that would inflate past this (a zip bomb guard). */
const MAX_PART_BYTES = 50 * 1024 * 1024;

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number };

function u16(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}
function u32(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  // End of central directory: the last 0x06054b50 within the final 64 KiB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("not a zip file");
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) {
      throw new XlsxError("broken zip directory");
    }
    const nameLength = u16(bytes, at + 28);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      name,
      method: u16(bytes, at + 10),
      compressedSize: u32(bytes, at + 20),
      offset: u32(bytes, at + 42),
    });
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return entries;
}

function readPart(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  if (!entry) return null;
  const at = entry.offset;
  if (u32(bytes, at) !== 0x04034b50) throw new XlsxError("broken zip entry");
  const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) {
    try {
      raw = inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES });
    } catch {
      throw new XlsxError("could not decompress the file");
    }
  } else throw new XlsxError("unsupported zip compression");
  return new TextDecoder().decode(raw);
}

function decodeXml(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e]!;
    });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : null;
}

/** All text runs inside an <si> or <is> element, phonetic hints left out. */
function textOf(xml: string): string {
  const clean = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) {
    out += decodeXml(m[1]!);
  }
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>): string {
  const workbook = readPart(bytes, entries, "xl/workbook.xml");
  const rels = readPart(bytes, entries, "xl/_rels/workbook.xml.rels");
  if (!workbook) throw new XlsxError("no workbook in the file");
  const sheet = /<(?:\w+:)?sheet\b[^>]*>/.exec(workbook)?.[0];
  const relId = sheet ? (attr(sheet, "r:id") ?? attr(sheet, "[\\w]+:id")) : null;
  if (rels && relId) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      if (attr(m[0], "Id") === relId) {
        const target = attr(m[0], "Target") ?? "";
        return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      }
    }
  }
  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  throw new XlsxError("no worksheet in the file");
}

export function readXlsx(bytes: Uint8Array): XlsxCell[][] {
  const entries = zipEntries(bytes);
  const sheet = readPart(bytes, entries, firstSheetPath(bytes, entries));
  if (!sheet) throw new XlsxError("no worksheet in the file");
  const sharedXml = readPart(bytes, entries, "xl/sharedStrings.xml") ?? "";
  const shared = [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(
    (m) => textOf(m[1]!),
  );

  const rows: XlsxCell[][] = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  let nextRow = 0;
  for (const rowMatch of sheet.matchAll(rowRe)) {
    const r = attr(rowMatch[1]!, "r");
    const rowIndex = r ? Number(r) - 1 : nextRow;
    nextRow = rowIndex + 1;
    const cells: XlsxCell[] = [];
    let nextCol = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(cellRe)) {
      const head = cellMatch[1]!;
      const body = cellMatch[2] ?? "";
      const ref = attr(head, "r");
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = attr(head, "t") ?? "n";
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      let value: XlsxCell = null;
      if (type === "inlineStr") value = textOf(body);
      else if (v === undefined) value = null;
      else if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "b") value = v === "1";
      else if (type === "str" || type === "d") value = decodeXml(v);
      else if (type === "e") value = null;
      else {
        const n = Number(v);
        value = Number.isFinite(n) ? n : decodeXml(v);
      }
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  return rows;
}
