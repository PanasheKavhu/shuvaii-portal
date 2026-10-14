import { describe, expect, it } from "vitest";
import {
  LEGAL_REVIEW_NOTE,
  PRIVACY_NOTICE_VERSION,
  contactText,
  privacySections,
  regionText,
  termsSections,
  type NoticeSchool,
} from "@/lib/privacy/notice";

const school: NoticeSchool = {
  name: "Msasa High",
  slug: "msasa-high",
  contactName: "The Bursar",
  contactEmail: "privacy@msasa.test",
};

const text = (sections: ReturnType<typeof privacySections>) =>
  sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.items ?? [])]).join("\n");

describe("privacy notice", () => {
  it("has a version the database accepts", () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^[0-9a-z.-]{1,40}$/);
  });

  it("says it is a draft for a lawyer to review", () => {
    expect(LEGAL_REVIEW_NOTE).toContain("reviewed by a lawyer before go-live");
  });

  it("names the school's data protection contact", () => {
    expect(contactText(school)).toBe("The Bursar at Msasa High, privacy@msasa.test.");
    expect(text(privacySections(school, null))).toContain(
      "Contact: The Bursar at Msasa High, privacy@msasa.test.",
    );
  });

  it("falls back to the school office when no contact is set, or no school is chosen", () => {
    expect(contactText({ ...school, contactEmail: null })).toContain("The office at Msasa High");
    expect(contactText(null)).toContain("Choose your school above");
  });

  it("names the data region when set, and says to ask when not", () => {
    expect(regionText(" Frankfurt, Germany (eu-central-1) ")).toBe(
      "Frankfurt, Germany (eu-central-1)",
    );
    expect(regionText(undefined)).toContain("ask the school's contact");
    expect(text(privacySections(school, "Frankfurt, Germany (eu-central-1)"))).toContain(
      "run on Supabase, in Frankfurt, Germany (eu-central-1).",
    );
  });

  it("covers what is stored, who sees it and how long it is kept", () => {
    const all = text(privacySections(school, null));
    for (const heading of [
      "What we store",
      "Where it is stored",
      "Who can see what",
      "How long we keep it",
      "Your rights and data requests",
    ]) {
      expect(all).toContain(heading);
    }
    expect(all).toContain("Learners:");
    expect(all).toContain("Parents and guardians:");
    expect(all).toContain("Staff:");
    expect(all).toContain("deleted after 30 days");
  });

  it("terms name the school and its contact", () => {
    const all = text(termsSections(school));
    expect(all).toContain("provided to Msasa High");
    expect(all).toContain("privacy@msasa.test");
  });
});
