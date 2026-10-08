import { completeSignup } from "./mail";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("landing session actions, auth validation, visibility and keyboard signup", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/me", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Find your people/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open CampusCollab" }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }).first(),
  ).toBeVisible();
  await page.unroute("**/auth/me");
  await page
    .getByRole("link", { name: "Create account", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Full name").fill("Landing Student");
  const email = `landing-${randomUUID()}@example.com`;
  await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `fictional-${randomUUID()}`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill("mismatch");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(page).toHaveURL(/\/signup$/);
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await expect(page.locator("#confirmPassword")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Show confirm password", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide confirm password", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("signup.png"),
    fullPage: true,
  });
  await page.getByLabel("Confirm password", { exact: true }).press("Enter");
  await completeSignup(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  for (const route of ["/login", "/signup"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/profile$/);
  }
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Open CampusCollab" }).first(),
  ).toHaveAttribute("href", "/profile");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Open CampusCollab" }).first().click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("login.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }).first(),
  ).toBeVisible();
});
test("public content survives backend failure and account actions recover", async ({
  page,
}) => {
  await page.route("**/auth/me", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Find your people/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Account unavailable.", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Demo" })).toHaveCount(0);
  await page.unroute("**/auth/me");
  await page
    .getByRole("button", { name: "Retry", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }).first(),
  ).toBeVisible();
});
