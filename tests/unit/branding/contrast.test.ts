import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  adjustForContrast,
  checkContrast,
  contrastRatio,
  isHexColor,
  meetsAA,
  parseHex,
  readableOn,
  relativeLuminance,
} from "@/lib/branding/contrast";

describe("parseHex and isHexColor", () => {
  it("reads 6- and 3-digit hex with or without #", () => {
    expect(parseHex("#0B5FA5")).toEqual({ r: 11, g: 95, b: 165 });
    expect(parseHex("fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("rejects anything else", () => {
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#0B5FA5; } body { display:none")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(() => parseHex("blue")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });

  it("does not depend on argument order", () => {
    expect(contrastRatio("#0B5FA5", "#ffffff")).toBe(contrastRatio("#ffffff", "#0B5FA5"));
  });
});

describe("meetsAA and readableOn", () => {
  it("passes the seeded Msasa blue on white and fails #777 on white", () => {
    expect(meetsAA("#0B5FA5", "#ffffff")).toBe(true);
    expect(meetsAA("#777777", "#ffffff")).toBe(false);
    expect(meetsAA("#777777", "#ffffff", 3)).toBe(true);
  });

  it("picks white on dark brand colours and black on light ones", () => {
    expect(readableOn("#0B5FA5")).toBe("#ffffff");
    expect(readableOn("#F2A900")).toBe("#000000");
  });
});

describe("adjustForContrast", () => {
  it("leaves a passing colour alone", () => {
    expect(adjustForContrast("#0b5fa5", "#ffffff")).toBe("#0b5fa5");
  });

  it("darkens a light colour until it passes on white", () => {
    const fixed = adjustForContrast("#F2A900", "#ffffff");
    expect(meetsAA(fixed, "#ffffff", AA_TEXT)).toBe(true);
    expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance("#F2A900"));
  });

  it("lightens a dark colour until it passes on a dark background", () => {
    const fixed = adjustForContrast("#0B5FA5", "#0a0a0a");
    expect(meetsAA(fixed, "#0a0a0a", AA_TEXT)).toBe(true);
    expect(relativeLuminance(fixed)).toBeGreaterThan(relativeLuminance("#0B5FA5"));
  });
});

describe("checkContrast", () => {
  it("accepts a passing pair with its ratio", () => {
    expect(checkContrast("#ffffff", "#0B5FA5")).toMatchObject({ ok: true });
  });

  it("rejects a failing pair with a passing suggestion", () => {
    const result = checkContrast("#F2A900", "#ffffff");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.ratio).toBeLessThan(AA_TEXT);
    expect(meetsAA(result.suggestion, "#ffffff")).toBe(true);
    expect(result.message).toContain(result.suggestion);
  });
});
