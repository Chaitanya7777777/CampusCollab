import { test, expect } from "@playwright/test";
test("public landing, anchors and explicit mock entry", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Find your people/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/Illustration, not live recruitment/),
  ).toBeVisible();
  await expect(page.getByText("Demo user", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page.getByRole("link", { name: "Features", exact: true }).click();
  await expect(page).toHaveURL(/#features$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("landing.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Open Demo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(
    page.getByRole("heading", { name: /Find your next team/ }).first(),
  ).toBeVisible();
  for (const route of ["/login", "/signup"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Mock mode" }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Demo" })).toHaveAttribute(
      "href",
      "/discover",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
});
