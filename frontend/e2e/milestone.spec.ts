import { test, expect } from "@playwright/test";
test("filters, removable chips, reset, sorting and project navigation", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByTestId("project-card")).toHaveCount(6);
  await page.getByLabel("Search projects, skills, or roles").fill("traffic");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page
    .getByLabel("Project type", { exact: true })
    .selectOption("Hackathon");
  await page.getByLabel("Skill", { exact: true }).selectOption("react-native");
  await expect(page.getByText("No projects match just yet")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Skill filter", exact: true })
    .click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByTestId("project-card")).toHaveCount(6);
  await page.getByRole("switch").check();
  await expect(page.getByTestId("project-card")).toHaveCount(5);
  await page.getByLabel("Sort by").selectOption("openings");
  await expect(page.getByTestId("project-card").first()).toContainText(
    "Open Source Study Planner",
  );
  await page
    .getByRole("link", {
      name: "View project: Open Source Study Planner",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/study-planner$/);
  await expect(
    page.getByRole("heading", {
      name: "Open Source Study Planner",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("You are already a team member.")).toBeVisible();
});
test("accessible application validation, submission and persistent duplicate prevention", async ({
  page,
}) => {
  await page.goto("/projects/smart-traffic");
  const apply = page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .first();
  await apply.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Backend & Systems Developer");
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close application dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(apply).toBeFocused();
  await apply.click();
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(dialog.getByText(/at least 50 characters/)).toBeVisible();
  await dialog
    .getByLabel("Why would you like to join this project?")
    .fill(
      "I would like to build reliable interfaces and collaborate with the team on useful campus technology.",
    );
  await dialog
    .getByLabel("Relevant experience & projects")
    .fill(
      "I built a small coursework project with typed APIs and a responsive React interface.",
    );
  await dialog.getByLabel("Portfolio or demo URL").fill("not-a-url");
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(
    dialog.getByText("Enter a full http:// or https:// URL."),
  ).toBeVisible();
  await dialog.getByLabel("Portfolio or demo URL").fill("");
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(dialog.getByText("Application submitted!")).toBeVisible();
  await dialog.getByRole("button", { name: "Back to project" }).click();
  await expect(
    page.getByText("Application pending", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Application pending", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Applications unavailable" }),
  ).toHaveCount(2);
  for (const button of await page
    .getByRole("button", { name: "Applications unavailable" })
    .all())
    await expect(button).toBeDisabled();
});
test("profile catalog skills, validation, discard and saved identity across screens", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.getByLabel("Full name")).toHaveValue("Maya Rao");
  await page.getByLabel("Full name").fill("M");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Enter at least 2 characters.")).toBeVisible();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByLabel("Full name")).toHaveValue("Maya Rao");
  await page.getByLabel("Full name").fill("Maya Test");
  await page.getByRole("button", { name: "Remove C++", exact: true }).click();
  await page.getByLabel("Search skill catalog").fill("figma");
  await page.getByRole("button", { name: "Add Figma", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Maya Test");
  await expect(
    page.getByRole("button", { name: "Remove Figma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove C++", exact: true }),
  ).toHaveCount(0);
  await page.goto("/projects/smart-traffic");
  await page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Maya Test");
  await expect(page.getByRole("dialog")).toContainText("Figma");
});
test("layouts fit viewport and application content scrolls internally", async ({
  page,
}, testInfo) => {
  for (const path of ["/discover", "/projects/smart-traffic", "/profile"]) {
    await page.goto(path);
    await expect(page.locator('.state-panel[role="status"]')).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      scale: "css",
      path: `test-results/${testInfo.project.name}-${path.split("/").pop()}.png`,
      fullPage: true,
    });
  }
  await page.goto("/projects/smart-traffic");
  await page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Submit application", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    scale: "css",
    path: `test-results/${testInfo.project.name}-application.png`,
  });
});
