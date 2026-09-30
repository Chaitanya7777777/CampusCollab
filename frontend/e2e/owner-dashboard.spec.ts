import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/projects/new");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Review flow project");
  await page
    .getByLabel("Project type", { exact: true })
    .selectOption("Research");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A student research project for exploring accessible campus maps.");
  await page.getByLabel("Total team capacity", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Add recruitment role", exact: true })
    .click();
  await page.getByLabel("Role title", { exact: true }).fill("Map Developer");
  await page
    .getByLabel("Add skill to role 1", { exact: true })
    .selectOption("fastapi");
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await page.getByRole("link", { name: "View Project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/project-[^/]+$/);
  return new URL(page.url()).pathname;
}
async function apply(page: Page, path: string) {
  await page.goto(path);
  await page.getByLabel("Demo user", { exact: true }).selectOption("aarav");
  await page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Why would you like to join this project?")
    .fill(
      "I want to make our campus more accessible and contribute reliable mapping tools to the team.",
    );
  await dialog
    .getByLabel("Relevant experience & projects")
    .fill("I have developed a responsive campus map in a university course.");
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Back to project" }).click();
  await expect(
    page.getByText("Application pending", { exact: true }),
  ).toBeVisible();
}

test("owner inbox accepts shared application, updates other tabs and joined projects", async ({
  page,
  context,
}, info) => {
  const path = await create(page);
  const applicant = await context.newPage();
  await apply(applicant, path);
  await page.goto("/my-projects");
  await page.getByLabel("Search my projects by title").fill("Review flow");
  await expect(
    page.getByText("1 pending applications", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-my-projects.png`,
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("link", { name: "Applicants (1)", exact: true }).click();
  await expect(page).toHaveURL(/tab=applications/);
  await page.getByLabel("Search applicant by name").fill("nobody");
  await expect(
    page.getByText("No applications match these filters"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByLabel("Filter applications by role")
    .selectOption({ label: "Map Developer" });
  await page.screenshot({
    path: `test-results/${info.project.name}-owner-inbox.png`,
    fullPage: true,
    scale: "css",
  });
  const review = page.getByRole("button", { name: "Review Aarav Sharma" });
  await review.click();
  const panel = page.getByRole("dialog", { name: "Aarav Sharma", exact: true });
  await expect(panel).toContainText("Self-declared skills");
  await page.keyboard.press("Escape");
  await expect(review).toBeFocused();
  await review.click();
  const box = await panel.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Accept Teammate" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/${info.project.name}-application-review.png`,
    scale: "css",
  });
  await panel.getByRole("button", { name: "Accept Teammate" }).click();
  const confirm = page.getByRole("dialog", { name: "Accept this applicant?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm acceptance" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    confirm.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(
    panel.getByText("This application is accepted and is read-only."),
  ).toBeVisible();
  await expect(
    applicant.getByText("Application accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    applicant.getByText("2 of 2 members", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close application review" }).click();
  await page
    .getByRole("navigation", { name: "Project dashboard tabs" })
    .getByRole("link", { name: /Team/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Team members (2 / 2)" }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 positions filled")).toBeVisible();
  await applicant.reload();
  await expect(
    applicant.getByText("Application accepted", { exact: true }),
  ).toBeVisible();
  await applicant.goto("/my-projects");
  await applicant.getByRole("button", { name: /Joined projects/ }).click();
  await expect(
    applicant.getByRole("heading", { name: "Review flow project" }),
  ).toBeVisible();
  await page.goto("/my-projects");
  await page.getByRole("button", { name: /Joined projects/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review flow project" }),
  ).toHaveCount(0);
});

test("stale review updates across tabs, closed recruitment allows rejection, archive is read-only", async ({
  page,
  context,
}) => {
  const path = await create(page);
  const applicant = await context.newPage();
  await apply(applicant, path);
  await page.goto(`${path}/manage?tab=applications`);
  await page.getByRole("button", { name: "Review Aarav Sharma" }).click();
  const second = await context.newPage();
  await second.goto(`${path}/manage?tab=settings`);
  await second
    .getByRole("button", { name: "Close recruitment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept Teammate" }),
  ).toBeDisabled();
  await second.goto(`${path}/manage?tab=applications`);
  await second.getByRole("button", { name: "Review Aarav Sharma" }).click();
  await second.getByRole("button", { name: "Reject", exact: true }).click();
  await second.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(
    page.getByText("This application is rejected and is read-only."),
  ).toBeVisible();
  await expect(
    applicant.getByText("Application rejected", { exact: true }),
  ).toBeVisible();
  // Changing the tab-scoped identity remounts the entire private view, even with a panel open.
  await page
    .getByLabel("Demo user", { exact: true })
    .selectOption("sneha", { force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Project not found or you do not have owner permission."),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Aarav Sharma", { exact: true }),
  ).toHaveCount(0);
  await second
    .getByRole("button", { name: "Close application review" })
    .click();
  await second.goto(`${path}/manage?tab=settings`);
  await second
    .getByRole("button", { name: "Archive Project", exact: true })
    .click();
  await second.getByRole("button", { name: "Confirm archive" }).click();
  await expect(
    second.getByRole("button", { name: "Open recruitment" }),
  ).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "Archive Project", exact: true }),
  ).toBeDisabled();
  await applicant.goto("/discover");
  await expect(
    applicant.getByRole("link", {
      name: "View project: Review flow project",
      exact: true,
    }),
  ).toHaveCount(0);
  await second.reload();
  await expect(
    second.getByRole("button", { name: "Archive Project", exact: true }),
  ).toBeDisabled();
});
