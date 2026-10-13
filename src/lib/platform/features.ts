/**
 * Per-school feature switches (US-10.3; D55). Stored in
 * `schools.feature_flags`, switched only by a platform admin, and enforced
 * by the database as well as here (private.feature_default() mirrors the
 * defaults below). Pure.
 */
export const FEATURES = {
  newsletter: {
    label: "Newsletter",
    description:
      "Announcements from the school: the Newsletter for admin and head, News for everyone else.",
    default: true,
  },
  attendance: {
    label: "Attendance",
    description:
      "Not built yet: waiting for the school's answer on attendance (Q25). The switch is kept for when it is.",
    default: false,
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type Features = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** Every feature at its default, as for a school whose flags are `{}`. */
export const DEFAULT_FEATURES: Features = {
  newsletter: FEATURES.newsletter.default,
  attendance: FEATURES.attendance.default,
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && Object.hasOwn(FEATURES, value);
}

/** A school's effective switches from its stored flags: a stored true or false wins, else the default. */
export function readFeatures(flags: unknown): Features {
  const stored = flags && typeof flags === "object" && !Array.isArray(flags) ? flags : {};
  const features = { ...DEFAULT_FEATURES };
  for (const key of FEATURE_KEYS) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "boolean") features[key] = value;
  }
  return features;
}
