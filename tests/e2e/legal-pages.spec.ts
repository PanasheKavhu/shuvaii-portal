import { expect, test } from "@playwright/test";
import { MSASA, MSASA_ADMIN, signIn } from "./helpers";

// The privacy notice and terms (Q20; D57), the footer and sign-in links to
// them, the school's own contact on the notice, and the health check (D59).

test("the footer links the privacy notice and terms on every page", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("contentinfo").getByRole("navigation", { name: "Legal" });
  await expect(legal.getByRole("link")).toHaveText(["Privacy notice", "Terms of use"]);
  await expect(page.getByRole("contentinfo")).toContainText(
    "Implemented by Panashe and Shuvai 2026",
  );

  await legal.getByRole("link", { name: "Privacy notice" }).click();
  await expect(page).toHaveURL("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("note")).toHaveText(
    "Draft: to be reviewed by a lawyer before go-live. This wording is not yet final.",
  );
  for (const heading of [
    "What we store",
    "Where it is stored",
    "Who can see what",
    "How long we keep it",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  // No side scroll at 360 px or on desktop.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  await page.getByRole("contentinfo").getByRole("link", { name: "Terms of use" }).click();
  await expect(page).toHaveURL("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("reviewed by a lawyer before go-live");
});

test("sign in links the privacy notice and terms", async ({ page }) => {
  await page.goto("/sign-in");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "privacy notice" })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await expect(main.getByRole("link", { name: "terms of use" })).toHaveAttribute("href", "/terms");
  await page.goto("/sign-in/learner?school=msasa-demo");
  await expect(
    page.getByRole("main").getByRole("link", { name: "privacy notice" }),
  ).toHaveAttribute("href", "/privacy?school=msasa-demo");
});

test("the notice names the contact the school admin keeps in setup", async ({ browser, page }) => {
  await signIn(page, MSASA_ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/setup");
  await page.getByRole("link", { name: "Privacy contact" }).click();
  await expect(page.getByRole("heading", { name: "Privacy contact" })).toBeVisible();
  await page.getByLabel("Contact name").fill("The Bursar");
  await page.getByLabel("Contact email").fill("privacy@msasa.demo.spportal.test");
  await page.getByRole("button", { name: "Save privacy contact" }).click();
  await expect(page.getByRole("status")).toHaveText("Privacy contact saved.");

  // Anyone, signed out, picks the school on the notice.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/privacy");
  await expect(visitor.getByText("Choose your school above")).toBeVisible();
  await visitor.getByLabel("Your school").selectOption({ label: MSASA.name });
  await visitor.getByRole("button", { name: "Show" }).click();
  await expect(visitor).toHaveURL("/privacy?school=msasa-demo");
  await expect(
    visitor.getByText(`Contact: The Bursar at ${MSASA.name}, privacy@msasa.demo.spportal.test.`),
  ).toBeVisible();
  await visitor.getByRole("link", { name: "Terms of use" }).first().click();
  await expect(visitor).toHaveURL("/terms?school=msasa-demo");
  await expect(visitor.getByText(`provided to ${MSASA.name}`)).toBeVisible();
  await visitor.context().close();
});

test("the health check answers ok and says nothing else", async ({ request }) => {
  const res = await request.get("/healthz");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ status: "ok" });
});

test("the retention clean-up refuses callers without the scheduler's secret", async ({
  request,
}) => {
  const anonymous = await request.get("/api/cron/retention");
  expect(anonymous.status()).toBe(401);
  const wrong = await request.get("/api/cron/retention", {
    headers: { authorization: `Bearer ${"x".repeat(40)}` },
  });
  expect(wrong.status()).toBe(401);
});
