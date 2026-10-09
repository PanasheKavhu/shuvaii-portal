/**
 * Keyboard moves in the marks grid (US-4.2). Pure. Rows are learners,
 * columns are assessments; only some cells can be typed in (a leaver's row
 * is read-only, and a phone shows one assessment at a time).
 */

export type Cell = { row: number; col: number };
export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Enter" | "ShiftEnter";

/**
 * The cell a key moves to, or null to stay put. Up and down (and Enter,
 * Shift+Enter) skip rows that cannot be typed in; left and right skip
 * columns that cannot.
 */
export function moveFrom(
  from: Cell,
  key: NavKey,
  rows: number,
  cols: number,
  canEnter: (cell: Cell) => boolean,
): Cell | null {
  const step = {
    ArrowUp: { row: -1, col: 0 },
    ShiftEnter: { row: -1, col: 0 },
    ArrowDown: { row: 1, col: 0 },
    Enter: { row: 1, col: 0 },
    ArrowLeft: { row: 0, col: -1 },
    ArrowRight: { row: 0, col: 1 },
  }[key];
  let { row, col } = from;
  for (;;) {
    row += step.row;
    col += step.col;
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    if (canEnter({ row, col })) return { row, col };
  }
}

/**
 * Whether left or right should leave the input rather than move the caret:
 * only when the caret is already at that end (or everything is selected).
 */
export function arrowLeavesInput(
  key: "ArrowLeft" | "ArrowRight",
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): boolean {
  if (selectionStart === null || selectionEnd === null) return true;
  if (selectionStart === 0 && selectionEnd === value.length) return true;
  if (selectionStart !== selectionEnd) return false;
  return key === "ArrowLeft" ? selectionStart === 0 : selectionEnd === value.length;
}
