import { completeSignup } from "./mail";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mailLink, openMailLink } from "./mail";

test("local email verification and password reset revoke old sessions and preserve profile", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const email = `recovery-${randomUUID()}@example.com`;
  const password = `fictional-${randomUUID()}`;
  const changed = `changed-${randomUUID()}`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Recovery Student");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await completeSignup(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toHaveCount(0);
  await page.goto("/verify-email");
  await expect(page.getByRole("status")).toContainText("already verified");
  await expect(
    page.getByRole("button", { name: "Resend verification email" }),
  ).toHaveCount(0);
  await page.goto("/profile");
  const context = await browser.newContext();
  const recovery = await context.newPage();
  await recovery.goto("http://localhost:3100/login");
  await recovery.getByRole("link", { name: "Forgot password?" }).click();
  await expect(recovery).toHaveURL(/\/forgot-password$/);
  await recovery.getByLabel("Email", { exact: true }).fill(email);
  await recovery.getByRole("button", { name: "Send reset link" }).click();
  await expect(recovery.getByRole("status")).toContainText("eligible account");
  await openMailLink(recovery, await mailLink(email, "reset"));
  await recovery.getByRole("button", { name: "Show passwords" }).click();
  await expect(
    recovery.getByLabel("New password", { exact: true }),
  ).toHaveAttribute("type", "text");
  await recovery.getByRole("button", { name: "Hide passwords" }).click();
  await recovery.getByLabel("New password", { exact: true }).fill(changed);
  await recovery.getByLabel("Confirm password", { exact: true }).fill(changed);
  await recovery.getByLabel("Confirm password", { exact: true }).press("Enter");
  await expect(recovery.getByRole("status")).toContainText(
    "All sessions have been revoked",
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Invalid email or password",
  );
  await page.getByLabel("Password", { exact: true }).fill(changed);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Full name")).toHaveValue("Recovery Student");
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toHaveCount(0);
  expect(
    await recovery.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await context.close();
});

test("token pages require explicit confirmation and invalid links remain recoverable", async ({
  page,
}) => {
  const response = await page.goto("/verify-email");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Open the latest link",
  );
  await expect(
    page.getByRole("button", { name: "Confirm email", exact: true }),
  ).toHaveCount(0);
  await page.goto("/reset-password");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Open the latest link",
  );
  await page.getByRole("link", { name: "Request a new reset link" }).click();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  // Empty public form only: no email link, token or credential is in this image.
  await page.screenshot({
    path: test.info().outputPath("forgot-password-layout.png"),
    fullPage: true,
  });
});
