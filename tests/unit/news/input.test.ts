import { describe, expect, it } from "vitest";
import { audienceLabel, parseAnnouncementInput } from "@/lib/news/input";

const ctx = { today: "2026-10-12", timeZone: "Africa/Harare" };
const base = {
  title: "  Sports day  ",
  body: "Dear parents,\r\n\r\nSee www.msasa.ac.zw  \n",
  audience: "parents",
  classId: "",
  pinned: null,
  expiresOn: "",
};
const CLASS = "cc000000-0000-4000-8000-0000000004b0";

describe("parseAnnouncementInput", () => {
  it("trims the title, keeps the body's line breaks and drops trailing space", () => {
    const parsed = parseAnnouncementInput(base, ctx);
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: "Sports day",
        body: "Dear parents,\n\nSee www.msasa.ac.zw",
        audience: "parents",
        classId: null,
        pinned: false,
        expiresAt: null,
      },
    });
  });

  it("needs a title, a body and an audience", () => {
    const parsed = parseAnnouncementInput(
      { ...base, title: " ", body: "\n ", audience: "everyone" },
      ctx,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(Object.keys(parsed.errors).sort()).toEqual(["audience", "body", "title"]);
  });

  it("needs the class for a class announcement, and drops it for any other", () => {
    expect(parseAnnouncementInput({ ...base, audience: "class" }, ctx)).toEqual({
      ok: false,
      errors: { classId: "Choose the class." },
    });
    const forClass = parseAnnouncementInput({ ...base, audience: "class", classId: CLASS }, ctx);
    expect(forClass.ok && forClass.value.classId).toBe(CLASS);
    const notClass = parseAnnouncementInput({ ...base, classId: CLASS }, ctx);
    expect(notClass.ok && notClass.value.classId).toBeNull();
  });

  it("reads the pin checkbox and turns the expiry date into the end of that day", () => {
    const parsed = parseAnnouncementInput({ ...base, pinned: "on", expiresOn: "2026-10-12" }, ctx);
    expect(parsed.ok && parsed.value).toMatchObject({
      pinned: true,
      expiresAt: "2026-10-12T22:00:00.000Z",
    });
  });

  it("refuses a past expiry date, unless it is the one already saved", () => {
    expect(parseAnnouncementInput({ ...base, expiresOn: "2026-10-11" }, ctx)).toEqual({
      ok: false,
      errors: { expiresOn: "Choose today or a later date." },
    });
    expect(
      parseAnnouncementInput(
        { ...base, expiresOn: "2026-10-11" },
        { ...ctx, savedExpiresOn: "2026-10-11" },
      ).ok,
    ).toBe(true);
    expect(parseAnnouncementInput({ ...base, expiresOn: "2026-13-01" }, ctx).ok).toBe(false);
  });

  it("refuses an over-long title or body", () => {
    expect(parseAnnouncementInput({ ...base, title: "x".repeat(201) }, ctx).ok).toBe(false);
    expect(parseAnnouncementInput({ ...base, body: "x".repeat(20001) }, ctx).ok).toBe(false);
  });
});

describe("audienceLabel", () => {
  it("names the class for a class announcement", () => {
    expect(audienceLabel("all")).toBe("Whole school");
    expect(audienceLabel("class", "4 Blue")).toBe("4 Blue (class)");
  });
});
