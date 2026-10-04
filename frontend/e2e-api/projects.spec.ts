import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
async function signup(page: Page, name: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`project-${randomUUID()}@example.com`);
  const password = `fictional-${randomUUID()}`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Full name")).toHaveValue(name);
}
async function mutate(
  request: APIRequestContext,
  path: string,
  method: string,
  data?: unknown,
) {
  const origin = "http://localhost:3100";
  const csrf = await request.get("http://localhost:8100/api/v1/auth/csrf", {
    headers: { Origin: origin },
  });
  return request.fetch(`http://localhost:8100/api/v1${path}`, {
    method,
    headers: { Origin: origin, "X-CSRF-Token": (await csrf.json()).csrfToken },
    data,
  });
}
test("two real accounts: private draft, publication, discovery, owner settings and archive", async ({
  page,
  browser,
}) => {
  const title = `Real Campus Garden ${randomUUID().slice(0, 8)}`;
  await signup(page, "Project Owner");
  await page
    .getByRole("link", { name: "+ Create Project", exact: true })
    .click();
  await page.getByLabel("Project title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Draft saved", exact: true }),
  ).toBeVisible();
  const id = page.url().split("/projects/")[1].split("/")[0];
  await page.getByRole("button", { name: "Continue Editing" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${id}/edit$`));
  await page.reload();
  await expect(page.getByLabel("Project title", { exact: true })).toHaveValue(
    title,
  );
  const otherContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: page.viewportSize()!,
  });
  const other = await otherContext.newPage();
  try {
    await signup(other, "Project Reader");
    const forbidden = await other.request.get(
      `http://localhost:8100/api/v1/projects/${id}/draft`,
    );
    expect(forbidden.status()).toBe(404);
    await other.goto("/discover");
    await other.getByLabel("Search projects, skills, or roles").fill(title);
    await expect(other.getByTestId("project-card")).toHaveCount(0);
    await page
      .getByLabel("Project type", { exact: true })
      .selectOption("Research");
    await page
      .getByLabel("Description", { exact: true })
      .fill(
        "A real project for campus garden research and student collaboration.",
      );
    await page
      .getByRole("button", { name: "Add recruitment role", exact: true })
      .click();
    await page
      .getByLabel("Role title", { exact: true })
      .fill("Backend Developer");
    await page
      .getByLabel("Add skill to role 1", { exact: true })
      .selectOption("python");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await page.getByRole("button", { name: "Continue Editing" }).click();
    expect(page.url()).toContain(`/projects/${id}/edit`);
    await page.screenshot({
      path: test.info().outputPath("real-project-editor.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Publish Project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Project published!", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View Project", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
    await expect(
      page.getByText("1 of 5 members", { exact: true }),
    ).toBeVisible();
    await other.reload();
    await other.getByLabel("Search projects, skills, or roles").fill(title);
    await expect(other.getByTestId("project-card")).toHaveCount(1);
    await other
      .getByRole("link", { name: `View project: ${title}`, exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("link", { name: "Manage Project", exact: true }),
    ).toHaveCount(0);
    await expect(
      other.getByRole("button", { name: "Apply for this role", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await other.request.get(
          `http://localhost:8100/api/v1/projects/${id}/manage`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (await mutate(other.request, `/projects/${id}/archive`, "POST")).status(),
    ).toBe(404);
    const draftData = {
      title: "Unauthorized",
      capacity: 2,
      type: "",
      description: "",
      eventName: "",
      roles: [],
    };
    expect(
      (
        await mutate(other.request, `/projects/${id}/draft`, "PATCH", draftData)
      ).status(),
    ).toBe(404);
    await other.goto(`/projects/${id}/manage`);
    await expect(
      other.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Manage Project", exact: true })
      .click();
    await expect(page.getByRole("link", { name: /^Applications/ })).toBeVisible();
    await page.getByRole("link", { name: /^Team/ }).click();
    await expect(
      page
        .getByRole("main")
        .getByText("Project Owner", { exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Close recruitment", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open recruitment", exact: true }),
    ).toBeVisible();
    await other.goto("/discover");
    await other.getByLabel("Search projects, skills, or roles").fill(title);
    await other.getByRole("switch").check();
    await expect(other.getByTestId("project-card")).toHaveCount(0);
    await other.getByRole("switch").uncheck();
    await expect(other.getByTestId("project-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Archive Project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm archive", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Archive Project", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: test.info().outputPath("real-owner-dashboard.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await other.reload();
    await other.getByLabel("Search projects, skills, or roles").fill(title);
    await expect(other.getByTestId("project-card")).toHaveCount(0);
    expect(
      (
        await other.request.get(`http://localhost:8100/api/v1/projects/${id}`)
      ).status(),
    ).toBe(404);
    await page.goto("/my-projects");
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("archived", { exact: true })).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

test("project errors never substitute seed data; expired session clears project workspace", async ({
  page,
  context,
}) => {
  await signup(page, "Isolated Project User");
  await page.route("**/api/v1/projects?*", (route) => route.abort());
  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(
    page.getByText("Smart Traffic Management", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/projects?*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toHaveCount(0);
  await page.goto("/projects/new");
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Private unsaved project");
  await context.clearCookies({ name: "cc_browser_test_session" });
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Project title", { exact: true })).toHaveCount(
    0,
  );
});
