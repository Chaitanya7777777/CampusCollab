import { test, expect, type Page } from "@playwright/test";
import { createSeed, CURRENT_STUDENT_ID } from "../src/lib/seed";
import { encodeStorage } from "../src/lib/mock-storage";
import type { Application } from "../src/lib/models";
const key = "campuscollab.prototype.v1";
const note = {
  motivation:
    "I would like to help build reliable campus tools and collaborate with this student team.",
  experience:
    "I built accessible forms and typed APIs for a university coursework project.",
  portfolio: "https://example.com/portfolio",
};
async function submit(page: Page) {
  await page.goto("/projects/smart-traffic");
  await page
    .getByRole("button", { name: "Apply for this role", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Why would you like to join this project?")
    .fill(note.motivation);
  await dialog
    .getByLabel("Relevant experience & projects")
    .fill(note.experience);
  await dialog
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await dialog
    .getByRole("link", { name: "My Applications", exact: true })
    .click();
  await expect(page).toHaveURL(/my-applications$/);
  await expect(page.getByText("1 of 1 applications shown")).toBeVisible();
}
const rows = (page: Page) =>
  page.locator(
    '[data-testid="application-row"]:visible, [data-testid="application-card"]:visible',
  );

test("submit, inspect and withdraw updates owner inbox across tabs and survives reload", async ({
  page,
  context,
}, info) => {
  await submit(page);
  const owner = await context.newPage();
  await owner.goto("/projects/smart-traffic/manage?tab=applications");
  await owner.getByLabel("Demo user", { exact: true }).selectOption("aarav");
  await owner.getByRole("button", { name: "Review Maya Rao" }).click();
  await page
    .getByRole("button", { name: "View Application", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Application details",
    exact: true,
  });
  await expect(dialog).toContainText(note.motivation);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View Application", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "View Application", exact: true })
    .click();
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await dialog
    .getByRole("button", { name: "Withdraw application", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/${info.project.name}-my-application-details.png`,
    scale: "css",
  });
  await dialog
    .getByRole("button", { name: "Withdraw application", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Withdraw this application?",
  });
  await expect(confirmation).toContainText("cannot reapply");
  await confirmation
    .getByRole("button", { name: "Confirm withdrawal" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await dialog
    .getByRole("button", { name: "Withdraw application", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Confirm withdrawal" })
    .click();
  await expect(
    dialog.getByText("This application is withdrawn and cannot be withdrawn."),
  ).toBeVisible();
  await expect(
    owner.getByText("This application is withdrawn and is read-only."),
  ).toBeVisible();
  await expect(
    owner.getByRole("button", { name: "Accept Teammate" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Close application details" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Withdrawn (1)", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View Project", exact: true }).click();
  await expect(
    page.getByText("Application withdrawn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply for this role", exact: true }),
  ).toHaveCount(0);
});

test("search filters global counts sorting membership history mobile layout and identity isolation", async ({
  page,
}, info) => {
  const db = createSeed();
  const statuses: Application["status"][] = [
    "accepted",
    "pending",
    "rejected",
    "withdrawn",
    "pending",
  ];
  db.applications = db.projects
    .slice(0, 5)
    .map((p, i) => ({
      ...note,
      id: `fixture-${i}`,
      projectId: p.id,
      roleId: db.roles.find((r) => r.projectId === p.id)!.id,
      studentId: CURRENT_STUDENT_ID,
      status: statuses[i],
      createdAt: `2026-09-0${i + 1}T00:00:00.000Z`,
    }));
  const serialized = encodeStorage(db);
  await page.goto("/my-applications");
  await expect(page.getByText("Your next collaboration awaits")).toBeVisible();
  await page.evaluate(
    ({ key, serialized }) => localStorage.setItem(key, serialized),
    { key, serialized },
  );
  await page.reload();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first()).toContainText(db.projects[4].title);
  await page.getByLabel("Sort applications").selectOption("oldest");
  await expect(rows(page).first()).toContainText(db.projects[0].title);
  await page.getByRole("button", { name: "Accepted (1)", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("not currently a member");
  await expect(
    page.getByRole("link", { name: "View Team", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "All (5)", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search applications by project or role")
    .fill("no such role");
  await expect(page.getByText("No matching applications")).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  const title = db.projects[1].title;
  await page.getByLabel("Search applications by project or role").fill(title);
  await expect(rows(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Pending (2)", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search applications by project or role").fill("");
  await expect(rows(page)).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-my-applications.png`,
    fullPage: true,
    scale: "css",
  });
  await rows(page)
    .first()
    .getByRole("button", { name: "View Application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(note.motivation);
  await page
    .getByLabel("Demo user", { exact: true })
    .selectOption("sneha", { force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(note.motivation, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Your next collaboration awaits")).toBeVisible();
});

test("withdrawal failure is recoverable and owner acceptance refreshes an open applicant panel", async ({
  page,
  context,
}) => {
  await submit(page);
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Withdraw this application?",
  });
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "restoreStorage", {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (k, v) {
      if (k === "campuscollab.prototype.v1") throw Error("quota");
      original.call(this, k, v);
    };
  });
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await confirm.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(confirm.getByRole("alert")).toContainText("could not be saved");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await page.evaluate(() => {
    (window as unknown as { restoreStorage: () => void }).restoreStorage();
  });
  // Leave confirmation open while the owner makes a competing decision in another tab.
  const owner = await context.newPage();
  await owner.goto("/projects/smart-traffic/manage?tab=applications");
  await owner.getByLabel("Demo user", { exact: true }).selectOption("aarav");
  await owner.getByRole("button", { name: "Review Maya Rao" }).click();
  await owner.getByRole("button", { name: "Accept Teammate" }).click();
  await owner.getByRole("button", { name: "Confirm acceptance" }).click();
  await expect(confirm).not.toBeVisible();
  await expect(
    page.getByText("This application is accepted and cannot be withdrawn."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "View Team", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw application", exact: true }),
  ).toHaveCount(0);
});
