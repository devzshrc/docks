import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("personal review inbox and knowledge revision lifecycle", async ({
  page,
}) => {
  const account = JSON.parse(
    readFileSync(new URL("./.auth/accounts.json", import.meta.url), "utf8"),
  ) as { memberEmail: string; password: string; reviewRepo: string };
  await page.goto("/login?next=%2Finbox");
  await page.getByLabel("Email", { exact: true }).fill(account.memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review workflow fixture" }),
  ).toBeVisible();
  if (test.info().project.name === "desktop")
    await page
      .getByRole("button", { name: "Accept review", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Accept review", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "My PRs", exact: true }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.goto(
    `/settings/repositories/knowledge?repo=${encodeURIComponent(account.reviewRepo)}`,
  );
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill(`Testing guide ${test.info().project.name}`);
  await page
    .getByLabel("Markdown content", { exact: true })
    .fill("# Tests\nCheck permission boundaries before merging.");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  const article = page
    .getByRole("article")
    .filter({ hasText: `Testing guide ${test.info().project.name}` });
  await expect(article).toBeVisible();
  await article.getByRole("button", { name: "Edit and history" }).click();
  await page
    .getByLabel("Markdown content", { exact: true })
    .fill("# Tests\nAlso check concurrent writes.");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(article).toContainText("Revision 2");
  await article.getByRole("button", { name: "Edit and history" }).click();
  await page
    .getByRole("button", { name: "Archive document", exact: true })
    .click();
  await expect(article).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show archived", exact: true })
    .click();
  await expect(article).toBeVisible();
  await article.getByRole("button", { name: "Edit and history" }).click();
  await page
    .getByRole("button", { name: "Restore document", exact: true })
    .click();
  await page.getByRole("button", { name: "Show active", exact: true }).click();
  await expect(article).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath("knowledge.png"),
    fullPage: true,
  });
});
