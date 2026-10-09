import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { completeSignup, mailLink, openMailLink } from "../e2e-api/mail";
// Reuse the exact scroll/form/session-expiry regression through same-origin forwarding.
import "../e2e-api/focus.spec";
test.use({ trace: "off", screenshot: "off", video: "off" });

test("same-origin signup, cookies, private profile, CSRF, logout and recovery", async ({
  page,
  browser,
}) => {
  const email = `proxy-${randomUUID()}@example.com`;
  const password = `fictional-${randomUUID()}`;
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/v1"))
      apiRequests.push(new URL(r.url()).origin);
  });
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Proxy Student");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await completeSignup(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("Full name").fill("Saved Proxy Student");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText(
      "Profile saved. Your changes are now available across CampusCollab.",
    ),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.filter((c) => c.name.startsWith("cc_browser_test")).length,
  ).toBe(2);
  expect(
    cookies
      .filter((c) => c.name.startsWith("cc_browser_test"))
      .every((c) => c.httpOnly && c.domain === "localhost" && c.path === "/"),
  ).toBe(true);
  const privateRead = await page.request.get("/api/v1/profiles/me");
  expect(privateRead.headers()["cache-control"]).toContain("no-store");
  const other = await browser.newContext({ baseURL: "http://localhost:3100" });
  expect((await other.request.get("/api/v1/profiles/me")).status()).toBe(401);
  await other.close();
  expect(
    (
      await page.request.patch("/api/v1/profiles/me", {
        headers: { Origin: "http://localhost:3100" },
        data: { name: "CSRF attack" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get("http://localhost:8100/api/v1/auth/me")).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await page.context().cookies()).filter(
      (c) => c.name === "cc_browser_test_session",
    ),
  ).toHaveLength(0);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Saved Proxy Student");
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await openMailLink(page, await mailLink(email, "reset"));
  await page.getByLabel("New password", { exact: true }).fill(password + "new");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(password + "new");
  await page.getByLabel("Confirm password", { exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "All sessions have been revoked",
  );
  expect(apiRequests.length).toBeGreaterThan(5);
  expect(
    apiRequests.every((origin) => origin === "http://localhost:3100"),
  ).toBe(true);
});
