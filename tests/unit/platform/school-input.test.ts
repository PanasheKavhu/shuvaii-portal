import { describe, expect, it } from "vitest";
import {
  LOGO_MAX_BYTES,
  checkLogoFile,
  logoObjectPath,
  parseAdminInvite,
  parseNewSchool,
  slugify,
  sniffImageType,
} from "@/lib/platform/school-input";

describe("parseNewSchool", () => {
  it("accepts a valid school and tidies the input", () => {
    expect(
      parseNewSchool({ name: "  Mufakose   High ", slug: "Mufakose-High", stage: "secondary" }),
    ).toEqual({
      ok: true,
      value: { name: "Mufakose High", slug: "mufakose-high", stage: "secondary" },
    });
  });

  it("reports every bad field", () => {
    const result = parseNewSchool({ name: "A", slug: "bad slug!", stage: "college" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["name", "slug", "stage"]);
  });

  it("rejects slugs with leading, trailing or double hyphens", () => {
    for (const slug of ["-abc", "abc-", "ab--c", "ab"]) {
      expect(parseNewSchool({ name: "Some School", slug, stage: "primary" }).ok, slug).toBe(false);
    }
  });
});

describe("slugify", () => {
  it("makes a URL-safe slug from a name", () => {
    expect(slugify("St. John's High School")).toBe("st-johns-high-school");
    expect(slugify("  Chéngé Primary  ")).toBe("chenge-primary");
    expect(slugify("x".repeat(60))).toHaveLength(40);
  });
});

describe("parseAdminInvite", () => {
  it("normalises the email", () => {
    expect(
      parseAdminInvite({ fullName: " Tariro  Moyo ", email: " T.Moyo@School.CO.ZW " }),
    ).toEqual({
      ok: true,
      value: { fullName: "Tariro Moyo", email: "t.moyo@school.co.zw" },
    });
  });

  it("rejects a missing name or bad email", () => {
    const result = parseAdminInvite({ fullName: "", email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.fullName).toBeDefined();
    expect(result.errors.email).toBeDefined();
  });
});

describe("checkLogoFile", () => {
  it("accepts PNG, JPEG and WebP up to 1 MB", () => {
    expect(checkLogoFile({ type: "image/png", size: 2048 })).toEqual({
      ok: true,
      extension: "png",
    });
    expect(checkLogoFile({ type: "image/jpeg", size: LOGO_MAX_BYTES })).toEqual({
      ok: true,
      extension: "jpg",
    });
  });

  it("rejects SVG, empty and oversized files", () => {
    expect(checkLogoFile({ type: "image/svg+xml", size: 100 }).ok).toBe(false);
    expect(checkLogoFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(checkLogoFile(null).ok).toBe(false);
    expect(checkLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 }).ok).toBe(false);
  });
});

it("logoObjectPath starts with the school id", () => {
  expect(logoObjectPath("abc", "png", new Date(1000))).toBe("abc/logo-1000.png");
});

describe("sniffImageType", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

  it("recognises PNG, JPEG and WebP signatures", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      "image/webp",
    );
  });

  it("rejects anything else, such as SVG or HTML renamed to .png", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
