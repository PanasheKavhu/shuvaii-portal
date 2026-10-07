import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  it("shows the implementation credit", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo").textContent).toBe(
      "Implemented by Panashe and Shuvai 2026",
    );
  });
});
