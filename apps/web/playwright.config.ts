import { defineConfig, devices } from "@playwright/test";

if (!process.env.DOCKS_TEST_DATABASE_URL)
  throw new Error(
    "Set DOCKS_TEST_DATABASE_URL to a disposable local PostgreSQL database",
  );
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      name: "API",
      command: "pnpm --filter @docks/server exec tsx scripts/e2e-server.ts",
      cwd: "../..",
      url: "http://localhost:4000/healthz",
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
      env: {
        DOCKS_E2E: "1",
        DATABASE_URL: process.env.DOCKS_TEST_DATABASE_URL,
        DOCKS_TEST_DATABASE_URL: process.env.DOCKS_TEST_DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-only-secret-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:4000",
        CLIENT_URL: "http://localhost:3000",
        RESEND_API_KEY: "",
        COOKIE_DOMAIN: "",
      },
    },
    {
      name: "Web",
      command: "pnpm start",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
});
