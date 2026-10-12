import { constants as zlibConstants, crc32, deflateRawSync } from "node:zlib";

/**
 * Writes a one-sheet Excel .xlsx file, for the marks upload template
 * (SPEC US-4.3; D33) and the exports (US-9.4; D52), whole or as a stream. Pure apart from using zlib to compress; no
 * dependency, like the reader in ./xlsx.ts (D24).
 *
 * Text goes in as inline strings (so learner numbers keep leading zeros),
 * numbers as numbers and null as an empty cell. The first row is bold and
 * frozen, and column widths can be set. Nothing else: no formulas, no
 * other sheets.
 */

export type XlsxWriteCell = string | number | null;

export type XlsxSheet = {
  name: string;
  rows: Iterable<readonly XlsxWriteCell[]>;
  /** Column widths in characters, by column. */
  widths?: readonly number[];
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function esc(s: string): string {
  return (
    s
      // Characters XML 1.0 cannot hold at all.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

export function columnName(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** Excel's sheet name rules: 1 to 31 characters, none of : \ / ? * [ ]. */
export function sheetName(name: string): string {
  const clean = name
    .replace(/[:\\/?*[\]]/g, " ")
    .trim()
    .slice(0, 31);
  return clean || "Sheet1";
}

/** The worksheet XML before, inside and after its rows, so rows can be streamed. */
function sheetHead(sheet: XlsxSheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const frozen =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `${XML}<worksheet xmlns="${MAIN}">${frozen}${cols}<sheetData>`;
}

const SHEET_TAIL = "</sheetData></worksheet>";

function rowXml(cells: readonly XlsxWriteCell[], r: number): string {
  const style = r === 0 ? ' s="1"' : "";
  const xml = cells
    .map((cell, c) => {
      if (cell === null || cell === "") return "";
      const ref = `${columnName(c)}${r + 1}`;
      if (typeof cell === "number" && Number.isFinite(cell)) {
        return `<c r="${ref}"${style}><v>${cell}</v></c>`;
      }
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(cell))}</t></is></c>`;
    })
    .join("");
  return `<row r="${r + 1}">${xml}</row>`;
}

const STYLES = `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Rows per compressed chunk of the worksheet. */
const ROWS_PER_CHUNK = 200;

type Part = { name: string; chunks: Iterable<Uint8Array> };

/**
 * A zip archive, one chunk at a time. Each part is deflated as it is
 * produced (sync-flushed blocks, then one empty final block), so a large
 * worksheet never has to be held as one string. Its CRC-32 and sizes are
 * only known at the end, so they follow the data in a data descriptor
 * (general purpose flag bit 3) and are repeated in the central directory.
 */
function* zipChunks(parts: readonly Part[]): Generator<Uint8Array> {
  const enc = new TextEncoder();
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = enc.encode(part.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(name.length, 26);
    yield local;
    yield name;

    let crc = 0;
    let size = 0;
    let compressed = 0;
    for (const data of part.chunks) {
      if (data.length === 0) continue;
      crc = crc32(data, crc);
      size += data.length;
      const body = deflateRawSync(data, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
      compressed += body.length;
      yield body;
    }
    const last = deflateRawSync(new Uint8Array(0));
    compressed += last.length;
    yield last;

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressed, 8);
    descriptor.writeUInt32LE(size, 12);
    yield descriptor;

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0008, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(compressed, 20);
    dir.writeUInt32LE(size, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, Buffer.from(name));
    offset += 30 + name.length + compressed + 16;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  yield Buffer.concat([...central, end]);
}

function* sheetChunks(sheet: XlsxSheet): Generator<Uint8Array> {
  const enc = new TextEncoder();
  yield enc.encode(sheetHead(sheet));
  let batch = "";
  let r = 0;
  for (const cells of sheet.rows) {
    batch += rowXml(cells, r++);
    if (r % ROWS_PER_CHUNK === 0) {
      yield enc.encode(batch);
      batch = "";
    }
  }
  yield enc.encode(batch + SHEET_TAIL);
}

/** The .xlsx file as a sequence of chunks, in order. */
export function xlsxChunks(sheet: XlsxSheet): Generator<Uint8Array> {
  const enc = new TextEncoder();
  const part = (name: string, xml: string): Part => ({ name, chunks: [enc.encode(xml)] });
  return zipChunks([
    part(
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    part(
      "_rels/.rels",
      `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    part(
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${esc(sheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    part(
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    part("xl/styles.xml", STYLES),
    { name: "xl/worksheets/sheet1.xml", chunks: sheetChunks(sheet) },
  ]);
}

/**
 * The .xlsx file as a response body stream (the exports, D52): each chunk
 * is made when the client is ready for it, and nothing is stored.
 */
export function xlsxStream(sheet: XlsxSheet): ReadableStream<Uint8Array> {
  const chunks = xlsxChunks(sheet);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(new Uint8Array(next.value));
    },
  });
}

export function writeXlsx(sheet: XlsxSheet): Uint8Array {
  return new Uint8Array(Buffer.concat([...xlsxChunks(sheet)]));
}
