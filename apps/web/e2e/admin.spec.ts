import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "./totp";

type Accounts = {
  ownerEmail: string;
  memberEmail: string;
  password: string;
  secret: string;
  memberId: string;
  workspaceId: string;
};
const accounts = () =>
  JSON.parse(
    readFileSync(new URL("./.auth/accounts.json", import.meta.url), "utf8"),
  ) as Accounts;
async function login(page: Page, email: string, password: string) {
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}
async function ownerLogin(page: Page) {
  const a = accounts();
  await login(page, a.ownerEmail, a.password);
  await expect(page).toHaveURL(/\/two-factor/);
  // Password alone must not leave an authenticated administrative session.
  const pending = await page.request.get(
    "http://localhost:4000/api/auth/get-session",
  );
  expect(await pending.json()).toBeNull();
  await page.getByLabel("Code", { exact: true }).fill(totp(a.secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your platform, at a glance" }),
  ).toBeVisible();
}

// Independent browser clients get separate trusted edge IPs; keep production limiters enabled.
test.beforeEach(async ({ context }, info) => {
  const octet = (info.project.name === "mobile" ? 129 : 1) + (info.line % 100);
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": `192.0.2.${octet}` });
});

test("anonymous and ordinary workspace owners cannot access administration", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administration is protected" }),
  ).toBeVisible();
  const a = accounts();
  await login(page, a.memberEmail, a.password);
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();
});

test("owner signs in with real 2FA, searches users, and revokes another session", async ({
  page,
}) => {
  await ownerLogin(page);
  const a = accounts();
  await page.goto("/admin/users");
  await page
    .getByRole("textbox", { name: "Search users" })
    .fill("no-such-person");
  await expect(page.getByText("No records match this view.")).toBeVisible();
  await page.getByRole("textbox", { name: "Search users" }).fill(a.memberEmail);
  await page.getByRole("link", { name: `E2E member ${a.memberEmail}` }).click();
  await expect(
    page.getByRole("heading", { name: "Sessions & devices" }),
  ).toBeVisible();
  // A separate browser context signs in as the member; admin revocation must invalidate it.
  const member = await page.context().browser()!.newContext();
  try {
    const response = await member.request.post(
      "http://localhost:4000/api/auth/sign-in/email",
      {
        data: { email: a.memberEmail, password: a.password },
        headers: {
          origin: "http://localhost:3000",
          "cf-connecting-ip": "192.0.2.254",
        },
      },
    );
    expect(response.ok()).toBeTruthy();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Revoke all sessions" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Revoke all sessions" }).click();
    await page
      .getByLabel("Reason", { exact: true })
      .fill("E2E device revocation verification");
    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(
      await (
        await member.request.get("http://localhost:4000/api/auth/get-session")
      ).json(),
    ).toBeNull();
  } finally {
    await member.close();
  }
});

test("complimentary premium grant and revocation appear in the audit trail", async ({
  page,
}) => {
  await ownerLogin(page);
  const a = accounts();
  await page.goto(`/admin/workspaces/${a.workspaceId}`);
  await page.getByRole("button", { name: "Grant or extend premium" }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("E2E complimentary premium grant");
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "Active", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke grant", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("E2E complimentary premium revocation");
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "Active", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/activity");
  await expect(
    page
      .getByRole("cell", {
        name: "E2E complimentary premium revocation",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Workspaces", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `E2E workspace ${a.workspaceId}` }),
    ).toBeVisible();
  }
});
