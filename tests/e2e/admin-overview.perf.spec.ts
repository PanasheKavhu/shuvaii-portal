import { expect, test, type Page } from "@playwright/test";
import { generateSchool } from "../../scripts/generate-school.mjs";
import { MSASA_ADMIN, signIn } from "./helpers";

// US-9.1 (D51): the overview loads in under 2 seconds on the seed school
// and on a generated school of 1,000 learners and 60 staff
// (scripts/generate-school.mjs). Runs in the "perf" project, after the
// other projects have finished, so the dev server is not busy with other
// tests while it is timed. Each load is timed from the request to the
// page's load event with the counts and the latest changes on screen;
// best of three, after a first visit that compiles the route.

async function timedOverview(page: Page): Promise<{ elapsed: number; times: number[] }> {
  const ready = async () => {
    await expect(page.getByTestId("count-marks")).toBeVisible();
    await expect(page.getByRole("list", { name: "Latest changes" })).toBeVisible();
  };
  await page.goto("/admin");
  await ready();
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    await page.goto("/admin");
    await ready();
    times.push(Date.now() - started);
  }
  return { elapsed: Math.min(...times), times };
}

test("the overview loads in under 2 seconds on the seed school", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  const { elapsed, times } = await timedOverview(page);
  expect(elapsed, `overview loads took ${times.join(", ")} ms`).toBeLessThan(2_000);
});

test("the overview loads in under 2 seconds for 1,000 learners and 60 staff", async ({ page }) => {
  test.setTimeout(300_000);
  const school = await generateSchool({ learners: 1000, staff: 60, prefix: "perf" });
  await signIn(page, school.adminEmail);
  await expect(page).toHaveURL("/admin");
  const { elapsed, times } = await timedOverview(page);
  await expect(page.getByTestId("count-learners")).toHaveText("1000");
  await expect(page.getByTestId("count-staff")).toHaveText("60");
  await expect(
    page.getByRole("list", { name: "Reports by class" }).getByRole("listitem"),
  ).toHaveCount(25);
  expect(elapsed, `overview loads took ${times.join(", ")} ms`).toBeLessThan(2_000);

  // Finding one learner among 1,000 opens their profile.
  await page
    .getByRole("searchbox", { name: "Find a learner, staff member or class" })
    .fill(school.firstLearnerNumber);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("list", { name: "Learners" }).getByRole("link").first().click();
  await expect(page.getByRole("list", { name: "Results for Term 3" })).toBeVisible();
});
