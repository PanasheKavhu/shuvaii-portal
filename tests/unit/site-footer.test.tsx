import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  afterEach(cleanup);

  it("shows the implementation credit", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveProperty(
      "textContent",
      expect.stringContaining("Implemented by Panashe and Shuvai 2026"),
    );
    expect(screen.getByText("Implemented by Panashe and Shuvai 2026").tagName).toBe("P");
  });

  it("links the privacy notice and the terms", () => {
    render(<SiteFooter />);
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(legal.querySelector('a[href="/privacy"]')?.textContent).toBe("Privacy notice");
    expect(legal.querySelector('a[href="/terms"]')?.textContent).toBe("Terms of use");
  });
});
