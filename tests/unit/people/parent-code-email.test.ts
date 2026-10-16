import { describe, expect, it } from "vitest";
import { parentCodeEmail } from "@/lib/people/parent-code-email";

const input = {
  schoolName: "Msasa Demo High School",
  guardianName: "Chipo Moyo",
  code: "ABCD-EFGH",
  link: "https://portal.example/join?code=ABCD-EFGH",
  expiresOn: "30 October 2026",
};

describe("parentCodeEmail", () => {
  it("names the school and carries the code, link and expiry", () => {
    const email = parentCodeEmail(input);
    expect(email.subject).toBe("Your parent code for Msasa Demo High School");
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Chipo Moyo");
      expect(part).toContain("ABCD-EFGH");
      expect(part).toContain("https://portal.example/join?code=ABCD-EFGH");
      expect(part).toContain("works once, until 30 October 2026");
    }
  });

  it("escapes names in the HTML part", () => {
    const email = parentCodeEmail({
      ...input,
      schoolName: `St Mary's <High>`,
      guardianName: `A & "B"`,
    });
    expect(email.html).toContain("St Mary&#39;s &lt;High&gt;");
    expect(email.html).toContain("A &amp; &quot;B&quot;");
    expect(email.html).not.toContain("<High>");
    expect(email.text).toContain(`St Mary's <High>`);
  });
});
