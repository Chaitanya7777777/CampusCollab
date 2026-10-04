import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const account = () => ({
  name: "API Student",
  email: `api-${randomUUID()}@example.com`,
  password: `fictional-${randomUUID()}`,
});
async function signup(page: Page, user: ReturnType<typeof account>) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(user.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Full name")).toHaveValue(user.name);
}
async function login(page: Page, user: ReturnType<typeof account>) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await page.getByLabel("Password", { exact: true }).press("Enter");
}
test("signup, optional profile, persistence, CSRF refresh, logout and re-login", async ({
  page,
  context,
}) => {
  let bootstraps = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/auth/csrf")) bootstraps++;
  });
  const user = account();
  await signup(page, user);
  await expect(page.getByLabel("College / university")).toHaveValue("");
  await expect(page.getByText("No skills selected yet.")).toBeVisible();
  await expect(page.getByText("Demo user", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Create Project/ }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Saved API Student");
  await page
    .getByLabel("College / university")
    .fill("Fictional API University");
  await page.getByRole("button", { name: "Add React", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.getByLabel("College / university").fill("Discard this");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByLabel("College / university")).toHaveValue(
    "Fictional API University",
  );
  await context.clearCookies({ name: "cc_browser_test_csrf" });
  await page.getByLabel("Department / major").fill("Computing");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Security token refreshed",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Saved API Student");
  await expect(
    page.getByRole("button", { name: "Remove React", exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("api-profile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, user);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("College / university")).toHaveValue(
    "Fictional API University",
  );
  await expect(page.getByLabel("Department / major")).toHaveValue("Computing");
  expect(bootstraps).toBeGreaterThanOrEqual(5);
  await page.goto("/my-projects");
  await expect(
    page.getByRole("heading", {
      name: "Your projects and teams",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Smart Traffic Management", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
});
test("duplicate registration, incorrect login and account switching isolate private forms across tabs", async ({
  page,
  context,
}) => {
  const first = account();
  await signup(page, first);
  await page.getByLabel("College / university").fill("Private First Campus");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  const other = await context.newPage();
  await other.goto("/profile");
  await expect(other.getByLabel("College / university")).toHaveValue(
    "Private First Campus",
  );
  await other
    .getByLabel("Department / major")
    .fill("Private unsaved department");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(other).toHaveURL(/\/login$/);
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(first.name);
  await page.getByLabel("Email", { exact: true }).fill(first.email);
  await page.getByLabel("Password", { exact: true }).fill(first.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(first.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "already exists",
  );
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await login(page, { ...first, password: "incorrect-password" });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Invalid email or password",
  );
  const second = { ...account(), name: "Second API Student" };
  await signup(page, second);
  await expect(page.getByLabel("College / university")).toHaveValue("");
  await expect(other).toHaveURL(/\/profile$/);
  await expect(other.getByLabel("Full name")).toHaveValue(second.name);
  await expect(other.getByLabel("Department / major")).toHaveValue("");
  await expect(
    other.getByText("Private First Campus", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.includes("campuscollab")),
    ),
  ).toEqual([]);
});
test("backend failure is explicit and never falls back to prototype identity", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/profile");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Cannot reach CampusCollab",
  );
  await expect(page.getByText("Maya Rao", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await page.unroute("**/api/v1/auth/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
