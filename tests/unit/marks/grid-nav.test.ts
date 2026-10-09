import { describe, expect, it } from "vitest";
import { arrowLeavesInput, moveFrom } from "@/lib/marks/grid-nav";

const all = () => true;

describe("moveFrom", () => {
  it("moves with arrows and Enter, stopping at the edges", () => {
    expect(moveFrom({ row: 0, col: 0 }, "ArrowDown", 3, 3, all)).toEqual({ row: 1, col: 0 });
    expect(moveFrom({ row: 1, col: 0 }, "Enter", 3, 3, all)).toEqual({ row: 2, col: 0 });
    expect(moveFrom({ row: 1, col: 0 }, "ShiftEnter", 3, 3, all)).toEqual({ row: 0, col: 0 });
    expect(moveFrom({ row: 0, col: 1 }, "ArrowRight", 3, 3, all)).toEqual({ row: 0, col: 2 });
    expect(moveFrom({ row: 0, col: 0 }, "ArrowUp", 3, 3, all)).toBeNull();
    expect(moveFrom({ row: 2, col: 2 }, "ArrowRight", 3, 3, all)).toBeNull();
  });

  it("skips read-only rows and hidden columns", () => {
    const leaverRow1 = ({ row }: { row: number }) => row !== 1;
    expect(moveFrom({ row: 0, col: 0 }, "Enter", 3, 1, leaverRow1)).toEqual({ row: 2, col: 0 });
    const onlyCol0 = ({ col }: { col: number }) => col === 0;
    expect(moveFrom({ row: 0, col: 0 }, "ArrowRight", 3, 3, onlyCol0)).toBeNull();
  });
});

describe("arrowLeavesInput", () => {
  it("leaves only from the end the arrow points at", () => {
    expect(arrowLeavesInput("ArrowLeft", "21", 0, 0)).toBe(true);
    expect(arrowLeavesInput("ArrowLeft", "21", 1, 1)).toBe(false);
    expect(arrowLeavesInput("ArrowRight", "21", 2, 2)).toBe(true);
    expect(arrowLeavesInput("ArrowRight", "21", 0, 2)).toBe(true);
    expect(arrowLeavesInput("ArrowRight", "21", 0, 1)).toBe(false);
  });
});
