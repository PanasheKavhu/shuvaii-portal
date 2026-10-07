import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/branding/contrast";
import {
  DARK_BACKGROUND,
  LIGHT_BACKGROUND,
  NO_BRANDING,
  brandTheme,
  logoUrl,
  schoolInitials,
  themeCss,
} from "@/lib/branding/theme";

const msasa = { logoPath: null, primaryColor: "#0B5FA5", accentColor: "#F2A900" };

describe("brandTheme", () => {
  it("sets primary and accent variables for light and dark mode", () => {
    const theme = brandTheme(msasa);
    expect(theme.light["--primary"]).toBe("#0b5fa5");
    expect(theme.light["--primary-foreground"]).toBe("#ffffff");
    expect(theme.light["--brand-accent"]).toBeDefined();
    expect(theme.dark["--primary"]).toBeDefined();
    expect(theme.dark["--brand-accent-foreground"]).toBeDefined();
  });

  it("keeps primary readable as text on each page background and under its foreground", () => {
    for (const color of ["#0B5FA5", "#1B7F5C", "#F2A900", "#111111", "#fafafa"]) {
      const { light, dark } = brandTheme({ ...NO_BRANDING, primaryColor: color });
      expect(contrastRatio(light["--primary"], LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark["--primary"], DARK_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(light["--primary"], light["--primary-foreground"]),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("leaves the default theme when colours are missing or invalid", () => {
    expect(brandTheme(NO_BRANDING)).toEqual({ light: {}, dark: {} });
    expect(brandTheme({ ...NO_BRANDING, primaryColor: "red;}*{display:none" })).toEqual({
      light: {},
      dark: {},
    });
  });
});

describe("themeCss", () => {
  it("writes light and dark rules that outrank globals.css", () => {
    const css = themeCss(brandTheme(msasa));
    expect(css).toMatch(/^html:root\{--primary:#0b5fa5;/);
    expect(css).toContain("html:root.dark{");
  });

  it("is empty with no branding", () => {
    expect(themeCss(brandTheme(NO_BRANDING))).toBe("");
  });
});

describe("logoUrl", () => {
  const base = "http://127.0.0.1:54321/";

  it("builds a public storage URL from a path", () => {
    expect(logoUrl("msasa/logo one.png", base)).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/school-branding/msasa/logo%20one.png",
    );
  });

  it("uses a full URL as it is and returns null with no logo", () => {
    expect(logoUrl("https://cdn.example.test/logo.svg", base)).toBe(
      "https://cdn.example.test/logo.svg",
    );
    expect(logoUrl(null, base)).toBeNull();
    expect(logoUrl("  ", base)).toBeNull();
  });
});

describe("schoolInitials", () => {
  it("skips filler words", () => {
    expect(schoolInitials("Msasa Demo High School")).toBe("M");
    expect(schoolInitials("Prince Edward School")).toBe("PE");
  });
});
