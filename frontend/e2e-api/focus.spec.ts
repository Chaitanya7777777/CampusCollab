import { test, expect, type Page } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

async function returnToTab(page: Page, check: () => Promise<void>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/auth/me", async (route) => {
    started();
    await gate;
    await route.continue();
  });
  const other = await page.context().newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  // Headless browsers do not consistently emit native OS focus events.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await requested;
  try {
    await check();
  } finally {
    const response = page.waitForResponse("**/auth/me");
    release();
    await response;
    await page.unroute("**/auth/me");
    await other.close();
  }
  await page.waitForLoadState("networkidle");
  await check();
}

test("tab return preserves scroll, filters and unsaved editors while refreshing the same account", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.CONVERSION_TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.CONVERSION_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Recruitment Owner");
  await page.getByLabel("Full name").fill("Unsaved profile name");
  await returnToTab(page, async () => {
    await expect(page.getByLabel("Full name")).toHaveValue(
      "Unsaved profile name",
    );
  });
  await page.goto("/projects/new");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Unsaved project title");
  await returnToTab(page, async () => {
    await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
      "Unsaved project title",
    );
  });
  await page.goto("/discover");
  await expect(page.locator(".project-card").first()).toBeVisible();
  await page.getByLabel("Sort by").selectOption("title");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(100);
  const url = page.url();
  const documentHandle = await page.locator("html").elementHandle();
  await returnToTab(page, async () => {
    expect(await documentHandle!.evaluate((node) => node.isConnected)).toBe(
      true,
    );
    expect(page.url()).toBe(url);
    await expect(page.getByLabel("Sort by")).toHaveValue("title");
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - y),
    ).toBeLessThan(5);
    await expect(page.locator(".project-card").first()).toBeAttached();
  });
  // A real 401 still removes private content and sends the visitor to login.
  await page.context().clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".project-card")).toHaveCount(0);
});
