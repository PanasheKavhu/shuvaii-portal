import { AA_LARGE, AA_TEXT, adjustForContrast, isHexColor, readableOn } from "./contrast";

/** The branding columns of `schools` (DATA_MODEL.md section 4.1). */
export type SchoolBranding = {
  logoPath: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

export const NO_BRANDING: SchoolBranding = {
  logoPath: null,
  primaryColor: null,
  accentColor: null,
};

/** Page backgrounds the brand colours must read against (globals.css --background). */
export const LIGHT_BACKGROUND = "#ffffff";
export const DARK_BACKGROUND = "#0a0a0a";

/** Bucket the school logo lives in once US-1.5 uploads land. */
export const BRANDING_BUCKET = "school-branding";

type Vars = Record<`--${string}`, string>;
export type BrandTheme = { light: Vars; dark: Vars };

/**
 * CSS variables for a school's colours in light and dark mode. Brand
 * colours are nudged (towards black on light pages, white on dark pages)
 * just enough to reach AA as text on the page background, and each gets a
 * readable foreground for buttons and badges. Missing or invalid colours
 * leave the default neutral theme in place.
 */
export function brandTheme(branding: SchoolBranding): BrandTheme {
  const light: Vars = {};
  const dark: Vars = {};

  if (isHexColor(branding.primaryColor)) {
    for (const [vars, background] of [
      [light, LIGHT_BACKGROUND],
      [dark, DARK_BACKGROUND],
    ] as const) {
      const primary = adjustForContrast(branding.primaryColor, background, AA_TEXT);
      const foreground = readableOn(primary);
      vars["--primary"] = primary;
      vars["--primary-foreground"] = foreground;
      vars["--ring"] = primary;
      vars["--sidebar-primary"] = primary;
      vars["--sidebar-primary-foreground"] = foreground;
    }
  }

  if (isHexColor(branding.accentColor)) {
    for (const [vars, background] of [
      [light, LIGHT_BACKGROUND],
      [dark, DARK_BACKGROUND],
    ] as const) {
      // Accent is decoration (stripes, badges), so the UI-component level applies.
      const accent = adjustForContrast(branding.accentColor, background, AA_LARGE);
      vars["--brand-accent"] = accent;
      vars["--brand-accent-foreground"] = readableOn(accent);
    }
  }

  return { light, dark };
}

function declarations(vars: Vars): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

/**
 * A style sheet applying the theme. Selectors outrank the defaults in
 * globals.css (`:root` and `.dark`). Values are validated hex colours
 * produced above, so they are safe to inline.
 */
export function themeCss(theme: BrandTheme): string {
  const parts: string[] = [];
  if (Object.keys(theme.light).length) parts.push(`html:root{${declarations(theme.light)}}`);
  if (Object.keys(theme.dark).length) parts.push(`html:root.dark{${declarations(theme.dark)}}`);
  return parts.join("");
}

/**
 * Public URL for a logo. Full http(s) URLs are used as they are; anything
 * else is a path in the public branding bucket. Null when there is no logo.
 */
export function logoUrl(logoPath: string | null, supabaseUrl: string): string | null {
  const path = logoPath?.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const encoded = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BRANDING_BUCKET}/${encoded}`;
}

/** Up to two initials for the logo fallback badge. */
export function schoolInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|demo|school|high|primary)$/i.test(w));
  const picked = words.length ? words : name.split(/\s+/).filter(Boolean);
  return picked
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
