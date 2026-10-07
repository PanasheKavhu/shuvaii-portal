import { describe, expect, it } from "vitest";
import {
  checkAccentColor,
  checkPrimaryColor,
  normalizeHex,
  parseBrandColors,
} from "@/lib/branding/brand-colors";
import { contrastRatio, readableOn } from "@/lib/branding/contrast";

describe("checkPrimaryColor", () => {
  it("accepts the seed schools' primary colours and normalises them", () => {
    expect(checkPrimaryColor("#0B5FA5")).toMatchObject({ ok: true, color: "#0b5fa5" });
    expect(checkPrimaryColor("#1B7F5C")).toMatchObject({ ok: true, color: "#1b7f5c" });
  });

  it("rejects a light colour with a passing suggestion", () => {
    const result = checkPrimaryColor("#7fb3e0");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.ratio).toBeLessThan(4.5);
    expect(contrastRatio(result.suggestion, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(result.message).toContain(`Try ${result.suggestion}`);
  });

  it("rejects anything that is not a hex colour", () => {
    expect(checkPrimaryColor("blue")).toMatchObject({ ok: false });
    expect(checkPrimaryColor("#0b5fa5;}")).toMatchObject({ ok: false });
  });
});

describe("checkAccentColor", () => {
  it("accepts bright accents that carry dark text", () => {
    expect(checkAccentColor("#F2A900")).toMatchObject({ ok: true, color: "#f2a900" });
    expect(checkAccentColor("#E4572E")).toMatchObject({ ok: true });
  });

  it("always finds black or white text that reaches AA (the worst case is about 4.58:1)", () => {
    for (const hex of ["#777777", "#767676", "#7f7f7f", "#ff0000", "#00ff00", "#0000ff"]) {
      const result = checkAccentColor(hex);
      expect(result.ok, hex).toBe(true);
      expect(contrastRatio(readableOn(hex), hex), hex).toBeGreaterThanOrEqual(4.5);
    }
    expect(checkAccentColor("orange")).toMatchObject({ ok: false });
  });
});

describe("parseBrandColors", () => {
  it("returns both normalised colours when both pass", () => {
    expect(parseBrandColors({ primaryColor: "#0B5FA5", accentColor: "#f2a900" })).toEqual({
      ok: true,
      value: { primaryColor: "#0b5fa5", accentColor: "#f2a900" },
    });
  });

  it("reports each failing field", () => {
    const result = parseBrandColors({ primaryColor: "#ffff00", accentColor: 42 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.primaryColor).toMatch(/Try #/);
    expect(result.errors.accentColor).toMatch(/hex code/);
  });
});

it("normalizeHex expands short hex", () => {
  expect(normalizeHex("ABC")).toBe("#aabbcc");
});
