import { test, expect } from "@playwright/test";
import { gunzipSync } from "node:zlib";

test("PostHog sends anonymous pageviews and identifies and resets authenticated users", async ({
  page,
}) => {
  // PostHog intentionally ignores automation. Exercise the real human-browser
  // path without disabling bot filtering in the production configuration.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  const events: { event: string; properties: Record<string, unknown> }[] = [];
  await page.route("**/ingest/**", async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/ingest/e/") {
      const raw = request.postDataBuffer()!;
      const text =
        raw[0] === 0x1f && raw[1] === 0x8b
          ? gunzipSync(raw).toString()
          : raw.toString();
      const payload = JSON.parse(text);
      events.push(
        ...(Array.isArray(payload) ? payload : (payload.batch ?? [payload])),
      );
      await route.fulfill({ json: { status: 1 } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
  let signedIn = false;
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: signedIn
        ? {
            user: {
              id: "analytics-test-user",
              name: "Analytics Test",
              email: "analytics@example.test",
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            session: {
              id: "analytics-session",
              userId: "analytics-test-user",
              token: "test",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }
        : null,
    }),
  );
  await page.goto("/?token=analytics-secret#private");
  await expect
    .poll(() => events.filter((e) => e.event === "$pageview").length)
    .toBe(1);
  expect(
    events.find((e) => e.event === "$pageview")!.properties.$current_url,
  ).toBe("http://localhost:3000/");
  const anonymousId = events.find((e) => e.event === "$pageview")!.properties
    .distinct_id;
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(() =>
      events.some(
        (e) =>
          e.event === "$pageview" &&
          String(e.properties.$current_url).includes("/login"),
      ),
    )
    .toBe(true);
  signedIn = true;
  await page.reload();
  await expect
    .poll(() =>
      events.some(
        (e) =>
          e.event === "$identify" &&
          e.properties.distinct_id === "analytics-test-user",
      ),
    )
    .toBe(true);
  signedIn = false;
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const persisted = localStorage.getItem(
          "ph_phc_e2e_test_project_posthog",
        );
        return persisted ? JSON.parse(persisted).$user_id : null;
      }),
    )
    .toBeFalsy();
  await page.goto("/");
  await expect
    .poll(() =>
      events.some(
        (e) =>
          e.event === "$pageview" &&
          e.properties.distinct_id !== anonymousId &&
          e.properties.distinct_id !== "analytics-test-user",
      ),
    )
    .toBe(true);
});
