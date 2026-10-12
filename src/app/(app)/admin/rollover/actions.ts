"use server";

import { revalidatePath } from "next/cache";
import { schoolAdminContext } from "@/lib/auth/viewer";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  OUTCOMES,
  buildPlan,
  defaultOutcome,
  parseTarget,
  readRolloverResult,
  type ClassTarget,
  type LearnerOutcome,
  type RolloverResult,
} from "@/lib/rollover/plan";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { loadRollover } from "./data";

/**
 * The Roll over screen's two actions (US-3.5, D53). Both rebuild the plan
 * on the server from the school admin's choices and the database as it is
 * now, then call roll_over_year(): once to preview (rolled back) and once
 * to apply, so what is applied is what was previewed unless something
 * changed in between.
 */

export type RolloverChoices = {
  toYearId: string;
  /** Class id to a target form value ("new", "class:<id>", "graduate", "skip"). */
  targets: Record<string, string>;
  /** Enrolment id to an outcome, for learners changed from their class's default. */
  outcomes: Record<string, string>;
};

export type RolloverState =
  { status: "error"; message: string } | { status: "done"; result: RolloverResult };

const NOT_ALLOWED_MESSAGE = "Only a school admin can roll a year over.";
const NOT_ALLOWED: RolloverState = { status: "error", message: NOT_ALLOWED_MESSAGE };

async function run(choices: RolloverChoices, apply: boolean): Promise<RolloverState> {
  const admin = await schoolAdminContext();
  if (!admin) return NOT_ALLOWED;
  if (
    !choices ||
    typeof choices !== "object" ||
    !isUuid(choices.toYearId) ||
    typeof choices.targets !== "object" ||
    typeof choices.outcomes !== "object"
  )
    return { status: "error", message: "Something was missing. Reload the page and try again." };

  const view = await loadRollover(admin.schoolId, choices.toYearId);
  if (!view.fromYear) return { status: "error", message: "The school has no current year." };
  if (!view.toYear || view.toYear.id !== choices.toYearId)
    return { status: "error", message: "Choose a year after the current one." };

  const targets = new Map<string, ClassTarget>();
  for (const c of view.classes) {
    const chosen = choices.targets[c.id];
    const target =
      chosen === undefined ? c.proposed : parseTarget(chosen, c.proposed, view.nextClasses);
    if (!target) return { status: "error", message: `Choose where ${c.name} goes.` };
    targets.set(c.id, target);
  }
  const learners = view.classes.flatMap((c) =>
    c.learners.map((l) => {
      const chosen = choices.outcomes[l.enrolmentId];
      const outcome = OUTCOMES.includes(chosen as LearnerOutcome)
        ? (chosen as LearnerOutcome)
        : defaultOutcome(targets.get(c.id)!);
      return { enrolmentId: l.enrolmentId, classId: c.id, name: l.name, outcome };
    }),
  );
  const built = buildPlan({
    fromYearId: view.fromYear.id,
    toYearId: view.toYear.id,
    classes: view.classes,
    targets,
    nextClasses: view.nextClasses,
    learners,
  });
  if (!built.ok) return { status: "error", message: built.problems.join(" ") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("roll_over_year", {
    p_plan: built.plan,
    p_apply: apply,
  });
  if (error) {
    return {
      status: "error",
      message: dbErrorMessage(error, {
        notAllowed: NOT_ALLOWED_MESSAGE,
        duplicate: `A class with one of those names already exists in ${view.toYear.label}. Choose it instead, or rename it in setup.`,
        fallback: "Could not roll the year over. Nothing was changed. Please try again.",
      }),
    };
  }
  if (apply) {
    revalidatePath("/admin", "layout");
    revalidatePath("/marks", "layout");
  }
  return { status: "done", result: readRolloverResult(data) };
}

export async function previewRollover(choices: RolloverChoices): Promise<RolloverState> {
  return run(choices, false);
}

export async function applyRollover(choices: RolloverChoices): Promise<RolloverState> {
  return run(choices, true);
}
