import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, toCsvLine } from "@/lib/people/csv";
import { readSheet } from "@/lib/people/sheet";
import { readUpload } from "@/lib/people/upload";
import { readXlsx, XlsxError } from "@/lib/people/xlsx";
import { buildXlsx } from "./xlsx-fixture";

const enc = (s: string) => new TextEncoder().encode(s);

describe("parseCsv", () => {
  it("reads quoted cells, doubled quotes, CRLF and a byte-order mark", () => {
    const csv = '﻿name,note\r\n"Moyo, Rudo","said ""hi"""\r\nTino,"two\nlines"\r\n';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Moyo, Rudo", 'said "hi"'],
      ["Tino", "two\nlines"],
    ]);
  });

  it("skips blank lines and trims cells", () => {
    expect(parseCsv("a,b\n\n  1 , 2 \n,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("uses semicolons when the header does", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(parseCsv("a;b\n1,5;2")).toEqual([
      ["a", "b"],
      ["1,5", "2"],
    ]);
  });

  it("keeps a last row with no newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });

  it("quotes template cells that need it", () => {
    expect(toCsvLine(["a", "b,c", 'say "x"'])).toBe('a,"b,c","say ""x"""');
  });

  it("keeps template cells from running as formulas in Excel", () => {
    expect(toCsvLine(['=HYPERLINK("http://x","y")', "+1+2", "-A1", "@SUM(A1)", "\tx"])).toBe(
      `"'=HYPERLINK(""http://x"",""y"")",'+1+2,'-A1,'@SUM(A1),'\tx`,
    );
    expect(toCsvLine(["-5", "+3", "12.5", "Test 1 (out of 30)"])).toBe(
      "-5,+3,12.5,Test 1 (out of 30)",
    );
  });
});

describe("readXlsx", () => {
  it("reads strings, numbers, booleans and gaps from the first sheet", () => {
    const bytes = buildXlsx([
      ["learner_number", "first_name", "date_of_birth", "flag"],
      ["MSH1", "Rudo & Tino <3", 41000, true],
      ["MSH2", null, null, false],
    ]);
    expect(readXlsx(bytes)).toEqual([
      ["learner_number", "first_name", "date_of_birth", "flag"],
      ["MSH1", "Rudo & Tino <3", 41000, true],
      ["MSH2", null, null, false],
    ]);
  });

  it("follows the workbook's relationship to the sheet", () => {
    const bytes = buildXlsx([["a"], ["1"]], { sheetPath: "worksheets/data.xml" });
    expect(readXlsx(bytes)).toEqual([["a"], ["1"]]);
  });

  it("refuses a tiny file that claims a huge row or column number", () => {
    const row = buildXlsx([], {
      sheetData: '<row r="200000000"><c r="A200000000"><v>1</v></c></row>',
    });
    expect(() => readXlsx(row)).toThrow(XlsxError);
    const col = buildXlsx([], { sheetData: '<row r="1"><c r="ZZZZZZZ1"><v>1</v></c></row>' });
    expect(() => readXlsx(col)).toThrow(XlsxError);
    const ok = buildXlsx([], { sheetData: '<row r="3000"><c r="Z3000"><v>1</v></c></row>' });
    expect(readXlsx(ok)).toHaveLength(3000);
  });
});

describe("readUpload", () => {
  it("reads CSV text", () => {
    expect(readUpload(enc("a,b\n1,2"))).toEqual({
      ok: true,
      kind: "csv",
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
    });
  });

  it("reads a Windows-1252 CSV from older Excel", () => {
    const bytes = new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x52, 0xe9, 0x6e, 0xe9, 0x65]);
    const read = readUpload(bytes);
    expect(read.ok && read.rows[1]).toEqual(["Rénée"]);
  });

  it("recognises an Excel workbook by its content", () => {
    const read = readUpload(buildXlsx([["a"], ["x"]]));
    expect(read).toMatchObject({ ok: true, kind: "xlsx", rows: [["a"], ["x"]] });
  });

  it("refuses empty, old .xls, broken zips and binary files", () => {
    expect(readUpload(new Uint8Array())).toEqual({ ok: false, error: "The file is empty." });
    expect(readUpload(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).toMatchObject({
      ok: false,
      error: expect.stringContaining(".xls"),
    });
    expect(readUpload(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toMatchObject({
      ok: false,
      error: expect.stringContaining("Could not read this Excel file"),
    });
    expect(readUpload(new Uint8Array([0x41, 0, 0x42]))).toMatchObject({ ok: false });
  });

  it("refuses files over 5 MB", () => {
    expect(readUpload(new Uint8Array(5 * 1024 * 1024 + 1).fill(0x41))).toMatchObject({
      ok: false,
      error: expect.stringContaining("5 MB"),
    });
  });
});

describe("readSheet", () => {
  const columns = [
    { key: "learner_number", label: "learner_number", required: true, aliases: ["number"] },
    { key: "class", label: "class", required: true, aliases: [] },
    { key: "sex", label: "sex", required: false, aliases: ["gender"] },
  ] as const;

  it("matches headers loosely and numbers rows as the spreadsheet does", () => {
    const read = readSheet(
      [[], ["Learner Number", " CLASS ", "Gender"], ["A1", "1 Blue", "F"], [null, ""], ["A2", "2"]],
      columns,
    );
    expect(read).toEqual({
      ok: true,
      records: [
        { row: 3, values: { learner_number: "A1", class: "1 Blue", sex: "F" } },
        { row: 5, values: { learner_number: "A2", class: "2", sex: null } },
      ],
    });
  });

  it("names each missing required column", () => {
    expect(
      readSheet(
        [
          ["number", "sex"],
          ["A1", "F"],
        ],
        columns,
      ),
    ).toEqual({
      ok: false,
      errors: [{ row: 1, message: 'Missing column "class". Use the template\'s header row.' }],
    });
  });

  it("refuses an empty file and a header with no rows", () => {
    expect(readSheet([], columns)).toMatchObject({ ok: false });
    expect(readSheet([["learner_number", "class"]], columns)).toMatchObject({
      ok: false,
      errors: [{ message: "The file has a header but no rows." }],
    });
  });
});
