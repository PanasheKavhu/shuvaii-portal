import { text, type CellValue } from "./fields";

/**
 * Turns the rows of an uploaded CSV or Excel sheet into records keyed by
 * column (SPEC US-3.1, US-3.2). Pure.
 *
 * The first non-empty row is the header. Headers are matched loosely
 * ("Learner number", "learner_number" and "LEARNER NO" all work) through
 * each column's aliases. Row numbers are the spreadsheet's own, so the
 * header is row 1 and errors point at the line the admin sees.
 */

export type ColumnSpec<K extends string> = {
  key: K;
  label: string;
  required: boolean;
  aliases: readonly string[];
};

export type SheetRecord<K extends string> = { row: number; values: Record<K, CellValue> };

export type RowError = { row: number; message: string };

export type SheetRead<K extends string> =
  { ok: true; records: SheetRecord<K>[] } | { ok: false; errors: RowError[] };

/** The most data rows one import may hold. */
export const MAX_IMPORT_ROWS = 3000;

export function headerKey(value: unknown): string {
  return text(typeof value === "string" ? value : String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBlank(cells: readonly CellValue[]): boolean {
  return cells.every((c) => c === null || c === undefined || text(c) === "");
}

export function readSheet<K extends string>(
  rows: readonly (readonly CellValue[])[],
  columns: readonly ColumnSpec<K>[],
): SheetRead<K> {
  const headerIndex = rows.findIndex((r) => !isBlank(r));
  if (headerIndex < 0) {
    return { ok: false, errors: [{ row: 0, message: "The file is empty." }] };
  }
  const header = rows[headerIndex]!.map(headerKey);
  const positions = new Map<K, number>();
  const errors: RowError[] = [];

  for (const column of columns) {
    const names = [column.key, ...column.aliases].map(headerKey);
    const at = header.findIndex((h) => names.includes(h));
    if (at >= 0) positions.set(column.key, at);
    else if (column.required) {
      errors.push({
        row: headerIndex + 1,
        message: `Missing column "${column.label}". Use the template's header row.`,
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  const records: SheetRecord<K>[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (isBlank(cells)) continue;
    const values = {} as Record<K, CellValue>;
    for (const column of columns) {
      const at = positions.get(column.key);
      values[column.key] = at === undefined ? null : (cells[at] ?? null);
    }
    records.push({ row: i + 1, values });
  }

  if (records.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "The file has a header but no rows." }] };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: `The file has ${records.length} rows; one import can hold up to ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
        },
      ],
    };
  }
  return { ok: true, records };
}
