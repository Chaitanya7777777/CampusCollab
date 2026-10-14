import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ trace: "off", screenshot: "off", video: "off" });

test("shared skill creation preserves unsaved forms, retries, saves profile and publishes role", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.CONVERSION_TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.CONVERSION_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  const originalName = await page.getByLabel("Full name").inputValue();
  const name = `Skill ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Full name").fill("Unsaved Skill Author");
  const search = page.getByLabel("Search skill catalog", { exact: true });
  await search.fill(name);
  await search.press("Enter");
  await expect(page.getByLabel("Full name")).toHaveValue(
    "Unsaved Skill Author",
  );
  let fail = true;
  let failRefresh = true;
  await page.route("**/api/v1/skills", async (route) => {
    if (route.request().method() === "POST" && fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"detail":"Temporarily unavailable"}',
      });
    } else if (route.request().method() === "GET" && failRefresh) {
      failRefresh = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Temporarily unavailable" }),
      });
    } else await route.continue();
  });
  const add = page.getByRole("button", { name: `Add “${name}”`, exact: true });
  await add.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Full name")).toHaveValue(
    "Unsaved Skill Author",
  );
  await add.click();
  await expect(page.getByRole("status")).toContainText(`${name} selected`);
  await expect(search).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue(
    "Unsaved Skill Author",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Full name")).toHaveValue(
    "Unsaved Skill Author",
  );
  await page.screenshot({
    path: testInfo.outputPath("skill-selector.png"),
    fullPage: true,
  });
  await page.getByLabel("Full name").fill(originalName);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText(
      "Profile saved. Your changes are now available across CampusCollab.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Remove ${name}`, exact: true }),
  ).toBeVisible();
  await page.goto("/projects/new");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Shared skill project");
  await page
    .getByLabel("Project type", { exact: true })
    .selectOption("Research");
  await page
    .getByLabel("Description", { exact: true })
    .fill(
      "Build a reproducible research project with students and shared skills.",
    );
  await page
    .getByRole("button", { name: "Add recruitment role", exact: true })
    .click();
  await page.getByLabel("Role title", { exact: true }).fill("Contributor");
  const roleName = `Role${randomUUID().replaceAll("-", "")}${"Z".repeat(44)}`;
  await page.getByLabel("Search skills for role 1").fill(roleName);
  await page
    .getByRole("button", { name: `Add “${roleName}”`, exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(`${roleName} selected`);
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
    "Shared skill project",
  );
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Project published!", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View Project", exact: true }).click();
  await expect(page.getByText(roleName).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("role-skill.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
