import { describe, expect, it } from "vitest";
import { greetingName } from "@/lib/people/greeting";

describe("greetingName", () => {
  it("uses the first name", () => {
    expect(greetingName("Ernest Chakwizira")).toBe("Ernest");
  });

  it("skips a title typed before the names", () => {
    expect(greetingName("Mr Ernest Chakwizira")).toBe("Ernest");
    expect(greetingName("Dr. Rudo Banda")).toBe("Rudo");
    expect(greetingName("mrs  Chipo  Moyo")).toBe("Chipo");
  });

  it("keeps a title with only a surname whole", () => {
    expect(greetingName("Mrs Moyo")).toBe("Mrs Moyo");
    expect(greetingName("Mr")).toBe("Mr");
  });

  it("returns nothing for an empty name", () => {
    expect(greetingName("   ")).toBe("");
  });
});
