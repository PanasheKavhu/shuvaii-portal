import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, isFeatureKey, readFeatures } from "@/lib/platform/features";

const OFF = { newsletter: true, attendance: false, auto_learner_numbers: false };

describe("readFeatures", () => {
  it("uses the defaults for a school with no flags: newsletter on, the others off", () => {
    expect(readFeatures({})).toEqual(OFF);
    expect(DEFAULT_FEATURES).toEqual(OFF);
  });

  it("lets a stored true or false win", () => {
    expect(readFeatures({ newsletter: false })).toEqual({ ...OFF, newsletter: false });
    expect(readFeatures({ attendance: true })).toEqual({ ...OFF, attendance: true });
    expect(readFeatures({ auto_learner_numbers: true })).toEqual({
      ...OFF,
      auto_learner_numbers: true,
    });
  });

  it("ignores anything that is not a known feature's true or false", () => {
    expect(readFeatures({ newsletter: "no", games: true })).toEqual(DEFAULT_FEATURES);
    expect(readFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(readFeatures([false])).toEqual(DEFAULT_FEATURES);
  });
});

describe("isFeatureKey", () => {
  it("knows the newsletter, attendance and automatic learner numbers only", () => {
    expect(isFeatureKey("newsletter")).toBe(true);
    expect(isFeatureKey("attendance")).toBe(true);
    expect(isFeatureKey("auto_learner_numbers")).toBe(true);
    expect(isFeatureKey("payments")).toBe(false);
    expect(isFeatureKey("toString")).toBe(false);
  });
});
