import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "./totp";

test("authorized health summaries refresh and fit desktop/mobile", async ({
  page,
  context,
}) => {
  const account = JSON.parse(
    readFileSync(new URL("./.auth/accounts.json", import.meta.url), "utf8"),
  ) as { ownerEmail: string; password: string; secret: string };
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.240" });
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("Email", { exact: true }).fill(account.ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/two-factor/);
  await page.getByLabel("Code", { exact: true }).fill(totp(account.secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your platform, at a glance" }),
  ).toBeVisible();
  await page.goto("/admin/health");
  await expect(page.getByText("Ready jobs", { exact: true })).toBeVisible();
  await expect(page.getByText("AI p95 (5 min)", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Latest deployment", { exact: true }),
  ).toBeVisible();
  const refresh = page.waitForResponse(
    (response) =>
      response.url().includes("admin.health") && response.status() === 200,
    { timeout: 20000 },
  );
  await refresh;
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath("health.png"),
    fullPage: true,
  });
});
