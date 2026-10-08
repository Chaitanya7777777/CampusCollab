import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { completeSignup } from "./mail";

test.use({ trace: "off", screenshot: "off", video: "off" });
test("signup code survives reload, creates account only on confirmation, then password-only login", async ({
  page,
}) => {
  const email = `code-${randomUUID()}@example.com`;
  const password = `fictional-${randomUUID()}`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Code Signup Student");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(
    page.getByRole("heading", { name: "Enter your verification code" }),
  ).toBeVisible();
  const before = await page.request.get("http://localhost:8100/api/v1/auth/me");
  expect(before.status()).toBe(401);
  expect(
    await page.evaluate(() =>
      Object.keys(
        JSON.parse(sessionStorage.getItem("campuscollab-pending-signup-v1")!),
      ).sort(),
    ),
  ).toEqual([
    "clockOffset",
    "deliveryStatus",
    "expiresAt",
    "registrationId",
    "resendAt",
  ]);
  await page.reload();
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toHaveAttribute("autocomplete", "one-time-code");
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toHaveAttribute("inputmode", "numeric");
  await expect(
    page.getByRole("button", { name: /Resend code in/ }),
  ).toBeDisabled();
  await completeSignup(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Full name")).toHaveValue("Code Signup Student");
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("campuscollab-pending-signup-v1"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Full name")).toHaveValue("Code Signup Student");
});
