import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Seed admins, heads and super admins get an authenticator app the tests know (D54).
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // In CI also as GitHub annotations, so a failure is readable on the check run.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  // The dev server compiles each route on first visit, which can exceed the 5s default.
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    // Mobile-first: 360px-wide screens are the primary target.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /\.perf\.spec\.ts$/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /\.perf\.spec\.ts$/ },
    // Timing checks run on their own once the others are done, so a busy
    // dev server does not decide them.
    {
      name: "perf",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\.perf\.spec\.ts$/,
      dependencies: ["mobile", "desktop"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
