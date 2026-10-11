import { describe, expect, it } from "vitest";
import { addressFrom } from "@/lib/request/address";

const h = (values: Record<string, string>) => new Headers(values);

describe("addressFrom", () => {
  it("uses the address the hosting proxy set", () => {
    expect(addressFrom(h({ "x-real-ip": "41.79.1.2", "x-forwarded-for": "10.0.0.1" }))).toBe(
      "41.79.1.2",
    );
  });

  it("takes the right-most forwarded address, not the one the client wrote", () => {
    expect(addressFrom(h({ "x-forwarded-for": "1.2.3.4, 41.79.1.2" }))).toBe("41.79.1.2");
    expect(addressFrom(h({ "x-forwarded-for": "41.79.1.2" }))).toBe("41.79.1.2");
    expect(addressFrom(h({ "x-forwarded-for": "1.2.3.4,  41.79.1.2 , " }))).toBe("41.79.1.2");
  });

  it("is unknown with neither header", () => {
    expect(addressFrom(h({}))).toBe("unknown");
    expect(addressFrom(h({ "x-real-ip": " ", "x-forwarded-for": "" }))).toBe("unknown");
  });
});
