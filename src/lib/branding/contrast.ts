/**
 * WCAG 2.x colour contrast helpers for school branding (SPEC US-1.5, NFR
 * accessibility). Pure. Colours are #rgb or #rrggbb hex strings.
 */
export type Rgb = { r: number; g: number; b: number };

/** WCAG AA for normal text. */
export const AA_TEXT = 4.5;
/** WCAG AA for large text and UI components. */
export const AA_LARGE = 3;

export const WHITE = "#ffffff";
export const BLACK = "#000000";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

export function parseHex(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  let digits = match[1];
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsAA(foreground: string, background: string, min = AA_TEXT): boolean {
  return contrastRatio(foreground, background) >= min;
}

/** White or black, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(BLACK, background) ? WHITE : BLACK;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * The colour closest to `color` (mixed towards black or white in small
 * steps) that reaches `min` contrast against `background`. Returns `color`
 * unchanged when it already passes. Used to suggest a fix for a failing
 * brand colour and to keep brand text readable in dark mode.
 */
export function adjustForContrast(color: string, background: string, min = AA_TEXT): string {
  if (meetsAA(color, background, min)) return toHex(parseHex(color));
  const towards = relativeLuminance(background) > 0.5 ? parseHex(BLACK) : parseHex(WHITE);
  const start = parseHex(color);
  for (let step = 1; step <= 100; step++) {
    const candidate = toHex(mix(start, towards, step / 100));
    if (meetsAA(candidate, background, min)) return candidate;
  }
  return toHex(towards);
}

export type ContrastCheck =
  { ok: true; ratio: number } | { ok: false; ratio: number; suggestion: string; message: string };

/**
 * Checks a text/background pair for AA. On failure, suggests a text colour
 * that passes on the same background (US-1.5: rejected with a suggestion).
 */
export function checkContrast(text: string, background: string, min = AA_TEXT): ContrastCheck {
  const ratio = Math.round(contrastRatio(text, background) * 100) / 100;
  if (ratio >= min) return { ok: true, ratio };
  const suggestion = adjustForContrast(text, background, min);
  return {
    ok: false,
    ratio,
    suggestion,
    message: `Contrast is ${ratio}:1; at least ${min}:1 is needed. Try ${suggestion}.`,
  };
}
