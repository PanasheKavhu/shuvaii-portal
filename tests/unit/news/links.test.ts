import { describe, expect, it } from "vitest";
import { bodyParagraphs, excerpt, linkHref, linkify } from "@/lib/news/links";

describe("linkify", () => {
  it("leaves text without addresses alone", () => {
    expect(linkify("Sports day is on Friday.")).toEqual([
      { kind: "text", text: "Sports day is on Friday." },
    ]);
  });

  it("finds http, https and www addresses, and drops the sentence's full stop", () => {
    expect(
      linkify("Forms at https://msasa.ac.zw/forms. Or www.msasa.ac.zw, or http://x.zw"),
    ).toEqual([
      { kind: "text", text: "Forms at " },
      { kind: "link", text: "https://msasa.ac.zw/forms", href: "https://msasa.ac.zw/forms" },
      { kind: "text", text: ". Or " },
      { kind: "link", text: "www.msasa.ac.zw", href: "https://www.msasa.ac.zw/" },
      { kind: "text", text: ", or " },
      { kind: "link", text: "http://x.zw", href: "http://x.zw/" },
    ]);
  });

  it("keeps a bracket the address opened and drops one the sentence opened", () => {
    expect(linkify("(see www.a.zw)")).toEqual([
      { kind: "text", text: "(see " },
      { kind: "link", text: "www.a.zw", href: "https://www.a.zw/" },
      { kind: "text", text: ")" },
    ]);
    const wiki = "https://en.wikipedia.org/wiki/Harare_(city)";
    expect(linkify(`About ${wiki}.`)[1]).toEqual({ kind: "link", text: wiki, href: wiki });
  });

  it("never links script or other schemes, and keeps markup as plain text", () => {
    for (const line of [
      "javascript:alert(1)",
      '<a href="javascript:alert(1)">x</a>',
      "data:text/html;base64,PHNjcmlwdD4=",
      "<script>alert(1)</script>",
    ]) {
      expect(linkify(line).every((s) => s.kind === "text")).toBe(true);
      expect(
        linkify(line)
          .map((s) => s.text)
          .join(""),
      ).toBe(line);
    }
  });

  it("stops an address at an angle bracket or quote", () => {
    expect(linkify('https://a.zw/"><script>')).toEqual([
      { kind: "link", text: "https://a.zw/", href: "https://a.zw/" },
      { kind: "text", text: '"><script>' },
    ]);
  });
});

describe("linkHref", () => {
  it("accepts only http and https addresses with a dotted host", () => {
    expect(linkHref("https://a.zw/x?y=1")).toBe("https://a.zw/x?y=1");
    expect(linkHref("www.a.zw")).toBe("https://www.a.zw/");
    expect(linkHref("https://localhost")).toBeNull();
    expect(linkHref("ftp://a.zw")).toBeNull();
    expect(linkHref("https://")).toBeNull();
  });
});

describe("bodyParagraphs", () => {
  it("splits paragraphs at blank lines and keeps single line breaks", () => {
    const paragraphs = bodyParagraphs("Dear parents,\r\n\r\nLine one\nLine two\n\n\n  \nBye");
    expect(paragraphs.map((p) => p.map((line) => line.map((s) => s.text).join("")))).toEqual([
      ["Dear parents,"],
      ["Line one", "Line two"],
      ["Bye"],
    ]);
  });
});

describe("excerpt", () => {
  it("shows a short body whole on one line", () => {
    expect(excerpt("One\ntwo  three")).toBe("One two three");
  });
  it("cuts a long body at a word", () => {
    const text = "word ".repeat(60);
    const out = excerpt(text, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("word…")).toBe(true);
  });
});
