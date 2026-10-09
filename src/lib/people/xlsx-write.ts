import { crc32, deflateRawSync } from "node:zlib";

/**
 * Writes a one-sheet Excel .xlsx file, for the marks upload template
 * (SPEC US-4.3; D33). Pure apart from using zlib to compress; no
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
  rows: readonly (readonly XlsxWriteCell[])[];
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

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((cells, r) => {
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
    })
    .join("");
  const frozen =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `${XML}<worksheet xmlns="${MAIN}">${frozen}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

type Part = { name: string; data: Uint8Array };

function zip(parts: readonly Part[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const part of parts) {
    const name = enc.encode(part.name);
    const body = deflateRawSync(part.data);
    const crc = crc32(part.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(part.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(part.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += 30 + name.length + body.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, ...central, end]));
}

export function writeXlsx(sheet: XlsxSheet): Uint8Array {
  const enc = new TextEncoder();
  const part = (name: string, xml: string): Part => ({ name, data: enc.encode(xml) });
  return zip([
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
    part("xl/worksheets/sheet1.xml", sheetXml(sheet)),
  ]);
}
