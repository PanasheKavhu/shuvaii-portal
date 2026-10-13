import "server-only";

import type { TwoFactorRow } from "@/components/platform/two-factor-people";
import { resetTwoFactor } from "./actions";
import type { TwoFactorPerson } from "./data";

const ROLE_NAMES: Record<string, string> = {
  super_admin: "Super admin",
  school_admin: "School admin",
  head: "Head",
};

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Harare",
});

/** Rows for the console's two-factor lists; no reset for the viewer's own (D54). */
export function twoFactorRows(people: TwoFactorPerson[], viewerId: string): TwoFactorRow[] {
  return people.map((p) => ({
    userId: p.userId,
    name: p.fullName ?? p.email ?? "Unknown",
    detail: [p.email, p.roles.map((r) => ROLE_NAMES[r] ?? r).join(" and ")]
      .filter(Boolean)
      .join(" · "),
    enrolled: p.enrolled,
    lastReset: p.lastResetAt ? day.format(new Date(p.lastResetAt)) : null,
    reset: p.userId === viewerId ? null : resetTwoFactor.bind(null, p.userId),
  }));
}
