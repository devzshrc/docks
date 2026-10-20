import { defineConfig, devices } from "@playwright/test";

/**
 * Runs the setup/performance checks against already-running dev servers and a
 * seeded local account (DOCKS_BROWSER_ACCOUNT_FILE), instead of booting the
 * isolated e2e stack. The regular config still picks the spec up in CI.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "setup-performance.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
