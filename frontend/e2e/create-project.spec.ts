import { test, expect, type Page } from "@playwright/test";
async function completeForm(page: Page) {
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Campus Energy Test");
  await page
    .getByLabel("Project type", { exact: true })
    .selectOption("Hackathon");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Build an accessible energy dashboard for university students.");
  await page
    .getByRole("button", { name: "Add recruitment role", exact: true })
    .click();
  await page
    .getByLabel("Role title", { exact: true })
    .fill("Backend Developer");
  await page
    .getByLabel("Add skill to role 1", { exact: true })
    .selectOption("fastapi");
}
test("draft save reload edit publish same ID and different student applies", async ({
  page,
}) => {
  await page.goto("/discover");
  await page
    .getByRole("link", { name: "+ Create Project", exact: true })
    .click();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Private first draft");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Draft saved", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/projects\/project-.+\/edit/);
  const editUrl = page.url().split("?")[0];
  await page.getByRole("button", { name: "Continue Editing" }).click();
  await expect(page).toHaveURL(editUrl);
  await page.reload();
  if (await page.getByRole("button", { name: "Continue Editing" }).isVisible())
    await page.getByRole("button", { name: "Continue Editing" }).click();
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
    "Private first draft",
  );
  await completeForm(page);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByRole("button", { name: "Continue Editing" }).click();
  expect(page.url().split("?")[0]).toBe(editUrl);
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Project published!", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View Project", exact: true }).click();
  await expect(page).toHaveURL(editUrl.replace("/edit", ""));
  await expect(
    page.getByRole("heading", { name: "Campus Energy Test", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 of 5 members", { exact: true })).toBeVisible();
  await page.getByLabel("Demo user", { exact: true }).selectOption("aarav");
  await page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Aarav Sharma");
  await dialog
    .getByLabel("Why would you like to join this project?")
    .fill(
      "I would like to contribute to this university energy project and build a reliable API with the team.",
    );
  await dialog
    .getByLabel("Relevant experience & projects")
    .fill("I built a sensor dashboard for a university course.");
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(dialog.getByText("Application submitted!")).toBeVisible();
  await dialog.getByRole("button", { name: "Back to project" }).click();
  await page
    .getByLabel("Demo user", { exact: true })
    .selectOption("student-maya");
  await expect(page.getByText("You are already a team member.")).toBeVisible();
  await expect(
    page.getByText("Application pending", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/discover");
  await page
    .getByRole("link", {
      name: "View project: Campus Energy Test",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Campus Energy Test", exact: true }),
  ).toBeVisible();
});
test("validation, mobile layout and unsaved cancel confirmation", async ({
  page,
}, info) => {
  await page.goto("/projects/new");
  await completeForm(page);
  await page.getByLabel("Total team capacity", { exact: true }).fill("2");
  await page.getByLabel("Openings", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(
    page.getByText(
      "Role openings exceed capacity. Reserve one place for the owner.",
    ),
  ).toBeVisible();
  await page.getByLabel("Total team capacity", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Remove FastAPI", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(
    page.getByText("Select at least one catalog skill."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-create-project.png`,
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep Editing" }).click();
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
    "Campus Energy Test",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard & Leave" }).click();
  await expect(page).toHaveURL(/\/discover$/);
});
test("identity switch isolates unsaved forms and private drafts and survives reload per tab", async ({
  page,
  context,
}) => {
  await page.goto("/projects/new");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Maya private draft");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByRole("button", { name: "Continue Editing" }).click();
  const editUrl = page.url();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Unsaved private text");
  await page.getByLabel("Demo user", { exact: true }).selectOption("sneha");
  await expect(
    page.getByText("Draft not found or you do not have permission to edit it."),
  ).toBeVisible();
  await expect(page.locator('input[value="Unsaved private text"]')).toHaveCount(
    0,
  );
  await page.goto("/profile");
  await expect(page.getByLabel("Full name")).toHaveValue("Sneha Patel");
  await page.getByLabel("Full name").fill("Unsaved Sneha");
  await page
    .getByLabel("Demo user", { exact: true })
    .selectOption("student-maya");
  await expect(page.getByLabel("Full name")).toHaveValue("Maya Rao");
  await page.getByLabel("Demo user", { exact: true }).selectOption("sneha");
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Sneha Patel");
  const second = await context.newPage();
  await second.goto("/profile");
  await expect(second.getByLabel("Demo user")).toHaveValue("student-maya");
  await second.goto(editUrl.split("?")[0]);
  await expect(second.getByLabel("Project title", { exact: true })).toHaveValue(
    "Maya private draft",
  );
});
test("failed save keeps form values and supports retry without partial data", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await completeForm(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "restoreStorage", {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (key, value) {
      if (key === "campuscollab.prototype.v1") throw new Error("test quota");
      original.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(page.getByText(/Your edits are still here/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("campuscollab.prototype.v1"),
    ),
  ).toBeNull();
  await page.evaluate(() => {
    (window as unknown as { restoreStorage: () => void }).restoreStorage();
  });
  await page
    .getByRole("button", { name: "Publish Project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Project published!", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("campuscollab.prototype.v1")!).projects
          .length,
    ),
  ).toBe(1);
});
