import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "./totp";

test("admin charts render, support keyboard exploration, and fit the viewport", async ({
  page,
  context,
}) => {
  const a = JSON.parse(
    readFileSync(new URL("./.auth/accounts.json", import.meta.url), "utf8"),
  ) as { ownerEmail: string; password: string; secret: string };
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.235" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("Email", { exact: true }).fill(a.ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/two-factor/);
  await page.getByLabel("Code", { exact: true }).fill(totp(a.secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  const trend = page.getByRole("img", {
    name: "Daily registrations",
    exact: true,
  });
  await expect(trend).toBeVisible();
  await expect(trend).toHaveAttribute("aria-roledescription", "chart");
  await expect(trend.locator("path").first()).toBeAttached();
  await expect(
    page.getByRole("list", { name: "Activation journey", exact: true }),
  ).toBeVisible();
  await trend.focus();
  await trend.press("ArrowRight");
  await expect(trend).toBeFocused();
  const tooltip = trend.locator(".trend-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/registrations/i);
  await page.screenshot({
    path: test.info().outputPath("overview.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/admin/metrics");
  await expect(
    page.getByRole("img", {
      name: "Line chart of weekly active reviewers over the last 8 weeks",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Line chart of reviews submitted in the app per week over the last 8 weeks",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
