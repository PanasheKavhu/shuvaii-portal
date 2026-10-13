import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, isFeatureKey, readFeatures } from "@/lib/platform/features";

describe("readFeatures", () => {
  it("uses the defaults for a school with no flags: newsletter on, attendance off", () => {
    expect(readFeatures({})).toEqual({ newsletter: true, attendance: false });
    expect(DEFAULT_FEATURES).toEqual({ newsletter: true, attendance: false });
  });

  it("lets a stored true or false win", () => {
    expect(readFeatures({ newsletter: false })).toEqual({ newsletter: false, attendance: false });
    expect(readFeatures({ attendance: true })).toEqual({ newsletter: true, attendance: true });
  });

  it("ignores anything that is not a known feature's true or false", () => {
    expect(readFeatures({ newsletter: "no", games: true })).toEqual(DEFAULT_FEATURES);
    expect(readFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(readFeatures([false])).toEqual(DEFAULT_FEATURES);
  });
});

describe("isFeatureKey", () => {
  it("knows the newsletter and attendance only", () => {
    expect(isFeatureKey("newsletter")).toBe(true);
    expect(isFeatureKey("attendance")).toBe(true);
    expect(isFeatureKey("payments")).toBe(false);
    expect(isFeatureKey("toString")).toBe(false);
  });
});
