import { inflateSync } from "node:zlib";

/**
 * Reads back what a report PDF says, for tests (D45): the text of each page
 * in drawing order (one line per text run), how many images each page
 * draws, and the colours text is drawn in. Enough of PDF for files made by
 * @react-pdf/renderer (pdfkit): Type0 fonts with a ToUnicode map, Flate
 * streams, one content stream per page. Not a general PDF reader.
 */

export type PdfPage = { lines: string[]; text: string; images: number; textColors: string[] };

type PdfObject = { dict: string; stream: Buffer | null };

function readObjects(bytes: Buffer): Map<number, PdfObject> {
  const s = bytes.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj([\s\S]*?)endobj/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const body = m[2]!;
    const at = body.indexOf("stream");
    if (at < 0) {
      objects.set(Number(m[1]), { dict: body, stream: null });
      continue;
    }
    const dict = body.slice(0, at);
    let data = body.slice(at + "stream".length).replace(/^\r?\n/, "");
    // The stream's own /Length, when given directly: trimming a trailing
    // newline instead would cut a compressed stream that ends in 0x0a.
    const length = /\/Length (\d+)(?! \d+ R)/.exec(dict);
    data = length
      ? data.slice(0, Number(length[1]))
      : data.slice(0, data.lastIndexOf("endstream")).replace(/\r?\n$/, "");
    const raw = Buffer.from(data, "latin1");
    objects.set(Number(m[1]), {
      dict,
      stream: /\/FlateDecode/.test(dict) ? inflateSync(raw) : raw,
    });
  }
  return objects;
}

const ref = (dict: string, key: string): number | null => {
  const m = new RegExp(`/${key} (\\d+) 0 R`).exec(dict);
  return m ? Number(m[1]) : null;
};

const hexChars = (hex: string): string[] => hex.match(/.{4}/g) ?? [];

/** Glyph id (4 hex digits) to text, from a ToUnicode CMap. */
function readCMap(cmap: string): Map<string, string> {
  const map = new Map<string, string>();
  // Ligatures map one glyph to several characters: <0066 0066 0069> is "ffi".
  const unicode = (hex: string) =>
    String.fromCodePoint(...hexChars(hex.replace(/\s+/g, "")).map((h) => Number.parseInt(h, 16)));
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, from, to] of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g))
      map.set(from!.toLowerCase(), unicode(to!));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of block[1]!.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g,
    )) {
      const start = Number.parseInt(lo!, 16);
      const end = Number.parseInt(hi!, 16);
      const targets = rest!.startsWith("[") ? [...rest!.matchAll(/<([0-9a-fA-F\s]+)>/g)] : null;
      for (let g = start; g <= end; g++) {
        const key = g.toString(16).padStart(4, "0");
        if (targets) map.set(key, unicode(targets[g - start]![1]!));
        else
          map.set(key, String.fromCodePoint(Number.parseInt(rest!.slice(1, -1), 16) + g - start));
      }
    }
  }
  return map;
}

export function readPdf(bytes: Buffer): PdfPage[] {
  const objects = readObjects(bytes);
  const pagesRoot = [...objects.values()].find((o) => /\/Type \/Pages\b/.test(o.dict));
  const kids = pagesRoot
    ? [...(/\/Kids \[([^\]]*)\]/.exec(pagesRoot.dict)?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((k) =>
        Number(k[1]),
      )
    : [];
  const cmaps = new Map<number, Map<string, string>>();
  const fontMap = (fontObj: number) => {
    if (!cmaps.has(fontObj)) {
      const toUnicode = ref(objects.get(fontObj)?.dict ?? "", "ToUnicode");
      const stream = toUnicode != null ? objects.get(toUnicode)?.stream : null;
      cmaps.set(fontObj, stream ? readCMap(stream.toString("latin1")) : new Map());
    }
    return cmaps.get(fontObj)!;
  };

  return kids.map((pageId) => {
    const page = objects.get(pageId)!;
    const resourcesId = ref(page.dict, "Resources");
    const resources = resourcesId != null ? objects.get(resourcesId)!.dict : page.dict;
    const fonts = new Map<string, number>();
    const fontDict = /\/Font <<([^>]*)>>/.exec(resources)?.[1] ?? "";
    for (const [, name, id] of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g))
      fonts.set(name!, Number(id));
    const xobjects = /\/XObject <<([^>]*)>>/.exec(resources)?.[1] ?? "";
    const images = [...xobjects.matchAll(/\/\w+ (\d+) 0 R/g)].filter((x) =>
      /\/Subtype \/Image/.test(objects.get(Number(x[1]))?.dict ?? ""),
    ).length;

    const contentId = ref(page.dict, "Contents")!;
    const content = objects.get(contentId)!.stream!.toString("latin1");
    const lines: string[] = [];
    const textColors = new Set<string>();
    let font = new Map<string, string>();
    let color = "0 0 0";
    const ops =
      /(\/(\w+) [\d.]+ Tf)|(\[(.*?)\] TJ)|(<([0-9a-fA-F]*)> Tj)|(BT)|(([\d.]+) ([\d.]+) ([\d.]+) scn)/g;
    let line = "";
    for (const m of content.matchAll(ops)) {
      if (m[1]) font = fontMap(fonts.get(m[2]!) ?? -1);
      else if (m[7]) {
        if (line) lines.push(line);
        line = "";
        textColors.add(color);
      } else if (m[8]) {
        color = [m[9], m[10], m[11]].map((v) => Number(v).toFixed(2)).join(" ");
      } else {
        const hex = m[3]
          ? [...m[4]!.matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join("")
          : m[6]!;
        line += hexChars(hex.toLowerCase())
          .map((g) => font.get(g) ?? "?")
          .join("");
      }
    }
    if (line) lines.push(line);
    return { lines, text: lines.join("\n"), images, textColors: [...textColors] };
  });
}

/** All pages' text with runs of white space made single spaces. */
export function flatText(pages: readonly PdfPage[]): string {
  return pages
    .map((p) => p.text)
    .join("\n")
    .replace(/\s+/g, " ");
}
