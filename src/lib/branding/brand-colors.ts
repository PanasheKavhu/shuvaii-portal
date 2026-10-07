import {
  AA_TEXT,
  adjustForContrast,
  checkContrast,
  contrastRatio,
  isHexColor,
  parseHex,
  readableOn,
  toHex,
} from "./contrast";
import { LIGHT_BACKGROUND } from "./theme";

/**
 * The check a super admin's colour choice must pass before it is saved
 * (SPEC US-1.5: "colour pairs failing WCAG AA contrast for text are
 * rejected with a suggestion"). Pure, so the form previews the same result
 * the server enforces.
 *
 * - Primary is used for links and headings on the white page and as the
 *   button background, so it must reach AA as text on white (which also
 *   makes white button text on it pass).
 * - Accent is a background for badges and stripes, so the best of black or
 *   white text on it must reach AA. Any colour gets at least about 4.58:1
 *   with one of them, so in practice only a malformed value fails; the
 *   check stays so the rule is explicit if the threshold ever changes.
 *
 * Dark mode needs no extra check: the theme lightens colours as needed (D12).
 */
export type ColorCheck =
  | { ok: true; color: string; ratio: number }
  | { ok: false; ratio: number; suggestion: string; message: string };

export function checkPrimaryColor(value: string): ColorCheck {
  if (!isHexColor(value)) return invalid();
  const color = normalizeHex(value);
  const result = checkContrast(color, LIGHT_BACKGROUND, AA_TEXT);
  if (result.ok) return { ok: true, color, ratio: result.ratio };
  return {
    ok: false,
    ratio: result.ratio,
    suggestion: result.suggestion,
    message: `As text on a white page this colour has contrast ${result.ratio}:1; at least ${AA_TEXT}:1 is needed. Try ${result.suggestion}.`,
  };
}

export function checkAccentColor(value: string): ColorCheck {
  if (!isHexColor(value)) return invalid();
  const color = normalizeHex(value);
  const text = readableOn(color);
  const ratio = Math.round(contrastRatio(text, color) * 100) / 100;
  if (ratio >= AA_TEXT) return { ok: true, color, ratio };
  const suggestion = adjustForContrast(color, text, AA_TEXT);
  return {
    ok: false,
    ratio,
    suggestion,
    message: `Text on this colour has contrast ${ratio}:1 at best; at least ${AA_TEXT}:1 is needed. Try ${suggestion}.`,
  };
}

export type BrandColorsParse =
  | { ok: true; value: { primaryColor: string; accentColor: string } }
  | { ok: false; errors: { primaryColor?: string; accentColor?: string } };

/** Validates the colours form at the server-action boundary. */
export function parseBrandColors(form: {
  primaryColor: unknown;
  accentColor: unknown;
}): BrandColorsParse {
  const primary = checkPrimaryColor(typeof form.primaryColor === "string" ? form.primaryColor : "");
  const accent = checkAccentColor(typeof form.accentColor === "string" ? form.accentColor : "");
  if (primary.ok && accent.ok) {
    return { ok: true, value: { primaryColor: primary.color, accentColor: accent.color } };
  }
  return {
    ok: false,
    errors: {
      ...(primary.ok ? {} : { primaryColor: primary.message }),
      ...(accent.ok ? {} : { accentColor: accent.message }),
    },
  };
}

/** `#abc` or `ABCDEF` to `#aabbcc`. Callers check isHexColor first. */
export function normalizeHex(value: string): string {
  return toHex(parseHex(value));
}

function invalid(): ColorCheck {
  return {
    ok: false,
    ratio: 0,
    suggestion: "",
    message: "Enter a colour as a hex code, like #0b5fa5.",
  };
}
