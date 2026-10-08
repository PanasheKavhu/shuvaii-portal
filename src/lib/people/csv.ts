/**
 * CSV reading for the staff and learner imports (SPEC US-3.1, US-3.2).
 * Pure: text in, rows of trimmed cells out.
 *
 * Follows RFC 4180 (quoted fields, doubled quotes, line breaks inside
 * quotes, CRLF or LF). Excel saves CSV with a byte-order mark and, in some
 * regional settings, with semicolons, so both are handled: the delimiter is
 * whichever of comma or semicolon appears more often in the header line.
 */

export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    // Skip lines with nothing in them (trailing newlines, spacer rows).
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cell += ch;
    }
    i++;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** One CSV line from cells, quoting where needed (used for the templates). */
export function toCsvLine(cells: readonly string[]): string {
  return cells.map((c) => (/[",;\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}
