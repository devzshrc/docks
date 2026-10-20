import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import superjson from "superjson";

function account() {
  return JSON.parse(
    readFileSync(
      process.env.DOCKS_BROWSER_ACCOUNT_FILE ??
        new URL("./.auth/accounts.json", import.meta.url),
      "utf8",
    ),
  ) as {
    memberEmail: string;
    password: string;
    reviewRepo: string;
    reviewNumber?: number;
  };
}
async function login(page: Page, next: string) {
  const fixture = account();
  // The dev server can compile the next page while the form hydrates; retry once.
  for (let attempt = 0; ; attempt++) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email", { exact: true }).fill(fixture.memberEmail);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}

/** Keep real authentication and access checks; replace only the feature's external effects. */
async function overrideRpc(
  page: Page,
  overrides: Record<string, (value: unknown) => unknown>,
) {
  await page.route("**/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname
      .split("/trpc/")[1]!
      .split(",");
    if (!names.some((n) => n in overrides)) return route.continue();
    if (
      route.request().method() === "POST" &&
      names.every((n) => n in overrides)
    ) {
      return route.fulfill({
        status: 200,
        json: names.map((n) => ({
          result: { data: superjson.serialize(overrides[n]!(undefined)) },
        })),
      });
    }
    const response = await route.fetch();
    const data = await response.json();
    const results = Array.isArray(data) ? data : [data];
    for (const [i, name] of names.entries()) {
      if (!(name in overrides)) continue;
      const value = results[i]?.result?.data
        ? superjson.deserialize(results[i].result.data)
        : undefined;
      results[i] = {
        result: { data: superjson.serialize(overrides[name]!(value)) },
      };
    }
    await route.fulfill({
      status: 200,
      json: Array.isArray(data) ? results : results[0],
    });
  });
}

test("large PRs fetch only the diff a reviewer opens", async ({ page }) => {
  let patches = 0;
  await overrideRpc(page, {
    "review.get": (value) => {
      const base = value as { pr: { headSha: string }; files: unknown[] };
      return {
        ...base,
        patchesDeferred: true,
        files: Array.from({ length: 101 }, (_, i) => ({
          filename: `src/large-${i}.ts`,
          sha: `file-${i}`,
          status: "modified",
          additions: 1,
          deletions: 1,
          tier: "core",
          viewed: false,
          changedSinceViewed: false,
        })),
      };
    },
    "review.filePatch": () => {
      patches++;
      return { patch: "@@ -1 +1 @@\n-old\n+new" };
    },
  });
  await login(
    page,
    `/review/${account().reviewRepo}/${account().reviewNumber ?? 1}`,
  );
  await expect(
    page.getByText("Large-PR mode shows the file list first.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open diff", exact: true }),
  ).toHaveCount(101);
  expect(patches).toBe(0);
  await page
    .getByRole("button", { name: "Open diff", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Open diff", exact: true }),
  ).toHaveCount(100);
  await expect.poll(() => patches).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a cached board renders while its fresh response is delayed", async ({
  page,
}) => {
  await login(page, "/review");
  await expect(
    page.getByRole("heading", { name: "Reviews", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("docks:queries:"))
          .some((k) => localStorage.getItem(k)?.includes("board")),
      ),
    )
    .toBe(true);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Hold every API response: the restored cache alone should render the board.
  await page.route("**/trpc/**", async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Reviews", exact: true }),
    ).toBeVisible();
    // Board lane labels come from a hydrated result, even though no request has answered.
    await expect(
      page.getByText("Waiting on review", { exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.body.innerText.includes("This page could not load"),
      ),
    ).toBe(false);
  } finally {
    release?.();
  }
});

test("setup explains failures and shows admin recovery controls", async ({
  page,
}) => {
  await overrideRpc(page, {
    "setup.health": () => ({
      canManage: true,
      checks: [
        {
          id: "webhooks",
          label: "GitHub webhooks",
          status: "fail",
          detail: "Webhook secret does not match.",
          fix: { action: "webhook_test", label: "Run webhook test" },
        },
      ],
      import: { pending: 0, openPrs: 0 },
      rateLimited: null,
    }),
    "setup.failedJobs": () => [
      {
        id: 42,
        type: "generate_guide",
        repo: account().reviewRepo,
        number: 1,
        failedAt: new Date(),
        attempts: 3,
        reason: "The AI walkthrough could not be generated.",
        retryable: true,
      },
    ],
    "setup.inviteSuggestions": () => [{ login: "teammate", activity: 6 }],
    "setup.webhookTest": () => ({
      status: "ok",
      detail: "Webhooks are reaching Docks.",
      guid: null,
      startedAt: new Date(),
    }),
  });
  await login(page, "/settings/setup");
  await expect(page.getByText("Webhook secret does not match.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email for teammate")).toBeVisible();
  await page.getByRole("button", { name: "Run webhook test" }).click();
  await expect(page.getByText("Webhooks are reaching Docks.")).toBeVisible();
});

test("starter rules are editable before opening a GitHub pull request", async ({
  page,
}) => {
  let created = 0;
  await overrideRpc(page, {
    "workspace.repoRules": () => ({
      found: false,
      rules: null,
      error: null,
      checkedAt: null,
    }),
    "workspace.starterRules": () => ({
      path: ".github/docks.yml",
      content: 'tiers:\n  core: ["src/**"]\n',
      truncated: false,
    }),
    "workspace.openRulesPr": () => {
      created++;
      return { url: "https://github.com/example/repo/pull/99", number: 99 };
    },
  });
  await login(page, "/settings/repositories");
  await page
    .getByRole("button", { name: "Review rules", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Suggest rules", exact: true })
    .click();
  const yaml = page.getByLabel("Proposed .github/docks.yml");
  await expect(yaml).toHaveValue('tiers:\n  core: ["src/**"]\n');
  await yaml.fill('tiers:\n  core: ["services/**"]\n');
  expect(created).toBe(0);
  await page
    .getByRole("button", { name: "Open rules pull request", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "View pull request #99", exact: true }),
  ).toBeVisible();
  expect(created).toBe(1);
});
