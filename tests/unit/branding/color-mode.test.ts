import { describe, expect, it } from "vitest";
import { isColorMode, resolveDark } from "@/lib/branding/color-mode";

describe("resolveDark", () => {
  it("follows an explicit choice", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });

  it("follows the device in system mode", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });

  it("recognises stored values", () => {
    expect(isColorMode("dark")).toBe(true);
    expect(isColorMode("blue")).toBe(false);
    expect(isColorMode(null)).toBe(false);
  });
});
