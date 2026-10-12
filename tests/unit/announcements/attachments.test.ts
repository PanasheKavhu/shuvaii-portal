import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentFileName,
  attachmentObjectPath,
  checkAttachmentFile,
  precheckAttachment,
  sniffAttachmentType,
} from "@/lib/announcements/attachments";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe("sniffAttachmentType", () => {
  it("knows a PDF and the three image types by their first bytes", () => {
    expect(sniffAttachmentType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe("application/pdf");
    expect(sniffAttachmentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "image/png",
    );
    expect(sniffAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    expect(sniffAttachmentType(webp)).toBe("image/webp");
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffAttachmentType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffAttachmentType(bytes(0x4d, 0x5a))).toBeNull(); // a Windows program
    expect(sniffAttachmentType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // a zip or .docx
    expect(sniffAttachmentType(new Uint8Array())).toBeNull();
  });
});

describe("checkAttachmentFile", () => {
  it("accepts a file of up to 5 MB while the announcement has fewer than 3", () => {
    expect(checkAttachmentFile({ size: ATTACHMENT_MAX_BYTES }, 2)).toEqual({ ok: true });
  });

  it("refuses a fourth file, an empty one and one over 5 MB", () => {
    expect(checkAttachmentFile({ size: 10 }, 3).ok).toBe(false);
    expect(checkAttachmentFile({ size: 0 }, 0).ok).toBe(false);
    expect(checkAttachmentFile(null, 0).ok).toBe(false);
    expect(checkAttachmentFile({ size: ATTACHMENT_MAX_BYTES + 1 }, 0)).toEqual({
      ok: false,
      error: "Each file must be 5 MB or smaller.",
    });
  });
});

describe("attachmentFileName", () => {
  it("keeps a plain name and uses the sniffed type's extension", () => {
    expect(attachmentFileName("Term 3 calendar.pdf", "application/pdf")).toBe(
      "Term-3-calendar.pdf",
    );
    expect(attachmentFileName("photo.PDF", "image/jpeg")).toBe("photo.jpg");
  });

  it("makes awkward names safe", () => {
    expect(attachmentFileName("../../etc/passwd", "image/png")).toBe("passwd.png");
    expect(attachmentFileName("Chéngé  trip!!.webp", "image/webp")).toBe("Chenge-trip.webp");
    expect(attachmentFileName("....pdf", "application/pdf")).toBe("file.pdf");
    expect(attachmentFileName("", "application/pdf")).toBe("file.pdf");
    expect(attachmentFileName(`${"a".repeat(300)}.pdf`, "application/pdf")).toHaveLength(84);
  });

  it("always matches the names the database accepts", () => {
    const accepted = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
    for (const name of ["-x.pdf", "_.png", "a..b.pdf", " spaced .jpg", "ñ.webp", "x".repeat(200)]) {
      const stored = attachmentFileName(name, "application/pdf");
      expect(stored, name).toMatch(accepted);
      expect(stored, name).not.toContain("..");
    }
  });
});

describe("attachmentObjectPath", () => {
  it("puts the file in the announcement's folder of its school", () => {
    expect(attachmentObjectPath("s-1", "a-1", "notice.pdf")).toBe("s-1/a-1/notice.pdf");
  });
});

describe("precheckAttachment", () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size });

  it("lets a PDF or image of up to 5 MB through", () => {
    expect(precheckAttachment(file("notice.pdf", "application/pdf"), 0)).toEqual({ ok: true });
    expect(precheckAttachment(file("Photo.JPG", "image/jpeg", ATTACHMENT_MAX_BYTES), 2)).toEqual({
      ok: true,
    });
    expect(precheckAttachment(file("scan.webp", ""), 0)).toEqual({ ok: true });
  });

  it("refuses another type, a file over 5 MB, or a fourth file before uploading", () => {
    expect(precheckAttachment(file("notes.txt", "text/plain"), 0).ok).toBe(false);
    expect(precheckAttachment(file("page.pdf", "text/html"), 0).ok).toBe(false);
    expect(
      precheckAttachment(file("big.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 1), 0),
    ).toEqual({
      ok: false,
      error: "Each file must be 5 MB or smaller.",
    });
    expect(precheckAttachment(file("one.pdf", "application/pdf"), 3).ok).toBe(false);
  });
});
