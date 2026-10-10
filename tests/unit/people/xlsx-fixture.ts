import { crc32, deflateRawSync } from "node:zlib";

/**
 * Builds a small .xlsx file in memory, laid out the way Excel writes one
 * (shared strings, numbers, a date serial, deflate compression), so the
 * reader can be tested without a binary fixture or a dependency.
 */

type Part = { name: string; data: Uint8Array; deflate: boolean };

function zip(parts: Part[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const part of parts) {
    const name = enc.encode(part.name);
    const body = part.deflate ? deflateRawSync(part.data) : part.data;
    const crc = crc32(part.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(part.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(part.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(part.deflate ? 8 : 0, 10);
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
  return Buffer.concat([...chunks, ...central, end]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Strings go to shared strings, numbers stay numbers, null is an empty cell. */
export function buildXlsx(
  rows: (string | number | boolean | null)[][],
  { sheetPath = "worksheets/sheet1.xml", sheetData = "" } = {},
): Uint8Array {
  const shared: string[] = [];
  const sheetRows = rows
    .map((cells, r) => {
      const xml = cells
        .map((cell, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (cell === null) return "";
          if (typeof cell === "number") return `<c r="${ref}" s="1"><v>${cell}</v></c>`;
          if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
          shared.push(cell);
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${xml}</row>`;
    })
    .join("");
  const enc = new TextEncoder();
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  return zip([
    {
      name: "[Content_Types].xml",
      data: enc.encode('<?xml version="1.0"?><Types/>'),
      deflate: false,
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Learners" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      deflate: true,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${sheetPath}"/></Relationships>`,
      ),
      deflate: true,
    },
    {
      name: "xl/sharedStrings.xml",
      data: enc.encode(
        `<?xml version="1.0"?><sst ${ns}>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`,
      ),
      deflate: true,
    },
    {
      name: `xl/${sheetPath}`,
      data: enc.encode(
        `<?xml version="1.0"?><worksheet ${ns}><sheetData>${sheetData || sheetRows}</sheetData></worksheet>`,
      ),
      deflate: true,
    },
  ]);
}
