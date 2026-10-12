/**
 * Announcement text (US-8.1, D50): plain text whose web addresses become
 * links. The body is never treated as HTML; the screen renders these
 * segments as React text and <a> elements, so nothing in a body can run as
 * script. Pure.
 */

export type TextSegment =
  { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

// http(s)://… or www.…, up to the next space or angle bracket.
const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// Punctuation that usually ends the sentence rather than the address.
const TRAILING = /[.,;:!?'")\]]$/;

/** A safe link target for an address found in text, or null. */
export function linkHref(address: string): string | null {
  const candidate = /^www\./i.test(address) ? `https://${address}` : address;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Splits one line into text and links. Punctuation after an address ends the
 * sentence, not the address; a closing bracket stays only when the address
 * also opened one, so "(see www.a.zw)" links "www.a.zw".
 */
export function linkify(line: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of line.matchAll(ADDRESS)) {
    let address = match[0];
    while (TRAILING.test(address)) {
      // Keep a ")" the address itself opened, e.g. ".../Harare_(city)".
      if (address.endsWith(")") && count(address, "(") >= count(address, ")")) break;
      address = address.slice(0, -1);
    }
    const href = address ? linkHref(address) : null;
    if (!href) continue;
    const start = match.index;
    if (start > last) segments.push({ kind: "text", text: line.slice(last, start) });
    segments.push({ kind: "link", text: address, href });
    last = start + address.length;
  }
  if (last < line.length) segments.push({ kind: "text", text: line.slice(last) });
  return segments;
}

/**
 * The body as paragraphs (split at blank lines) of lines (split at single
 * line breaks), each line already split into segments.
 */
export function bodyParagraphs(body: string): TextSegment[][][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n(?:[ \t]*\n)+/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ""))
    .filter((paragraph) => paragraph.trim() !== "")
    .map((paragraph) => paragraph.split("\n").map(linkify));
}

/** The first words of the body for a list, at most `max` characters, on one line. */
export function excerpt(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}
