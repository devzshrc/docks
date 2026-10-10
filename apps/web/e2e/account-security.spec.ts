import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "./totp";

test("GitHub-only user creates a password before setting up 2FA", async ({
  page,
  context,
}, info) => {
  const accounts = JSON.parse(
    readFileSync(new URL("./.auth/accounts.json", import.meta.url), "utf8"),
  ) as {
    socialAccounts: Record<
      string,
      { socialEmail: string; socialCookie: string; socialResetToken: string }
    >;
    password: string;
  };
  const fixture = {
    ...accounts.socialAccounts[info.project.name]!,
    password: accounts.password,
  };
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.230" });
  const separator = fixture.socialCookie.indexOf("=");
  await context.addCookies([
    {
      name: fixture.socialCookie.slice(0, separator),
      value: fixture.socialCookie.slice(separator + 1),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/settings/account");
  await expect(
    page.getByRole("button", { name: "Send password setup link" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Create a Docks password first to set up two-factor authentication.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send password setup link" }).click();
  await expect(
    page.getByText(
      `Password setup link sent to ${fixture.socialEmail}. Check your email, then return here to set up two-factor authentication.`,
    ),
  ).toBeVisible();

  // The local fixture supplies an email verification token; production tokens stay in email.
  await page.goto(
    `/reset-password?token=${fixture.socialResetToken}&next=%2Fsettings%2Faccount`,
  );
  await page.getByLabel("New password", { exact: true }).fill(fixture.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(fixture.password);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Faccount/);
  await page.goto("/settings/account");
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .first()
    .fill(fixture.password);
  await page.getByRole("button", { name: "Set up", exact: true }).click();
  await expect(
    page.getByAltText("QR code for your authenticator app"),
  ).toBeVisible();
  const secret = await page.locator("code").textContent();
  await page.getByLabel("Authenticator code").fill(totp(secret!));
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(
    page.getByText("Two-factor authentication is on", { exact: true }),
  ).toBeVisible();
});
