import { completeSignup } from "./mail";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signup(page: Page, name: string) {
  const email = `team-${randomUUID()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `fictional-${randomUUID()}`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await completeSignup(page, email);
  await expect(page).toHaveURL(/\/profile$/);
}
async function mutate(
  request: APIRequestContext,
  path: string,
  data?: unknown,
) {
  const csrf = await request.get("http://localhost:8100/api/v1/auth/csrf", {
    headers: { Origin: "http://localhost:3100" },
  });
  return request.post(`http://localhost:8100/api/v1${path}`, {
    headers: {
      Origin: "http://localhost:3100",
      "X-CSRF-Token": (await csrf.json()).csrfToken,
    },
    data,
  });
}

test("real recruitment: acceptance, rejection, withdrawal and refreshed team occupancy", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await signup(page, "Team Owner");
  const title = `Team Formation ${randomUUID().slice(0, 8)}`;
  const created = await mutate(page.request, "/projects?publish=true", {
    title,
    type: "Research",
    description: "A student project with real recruitment and team formation.",
    capacity: 3,
    roles: [
      {
        id: randomUUID(),
        title: "Backend Developer",
        responsibilities: "Build the API",
        skillIds: ["python"],
        openings: 2,
      },
    ],
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  for (const action of ["accept", "reject", "withdraw"] as const) {
    const context = await browser.newContext({
      baseURL: "http://localhost:3100",
      viewport: page.viewportSize()!,
    });
    const applicant = await context.newPage();
    try {
      await signup(applicant, `${action} Student`);
      await applicant.goto(`/projects/${id}`);
      await applicant
        .getByRole("button", { name: "Apply for this role" })
        .click();
      await applicant
        .getByLabel("Why would you like to join this project?")
        .fill(
          "I want to contribute to this campus project and learn from working together with the team.",
        );
      await applicant
        .getByLabel("Relevant experience & projects")
        .fill(
          "I have completed coursework and built several useful student projects.",
        );
      await applicant
        .getByRole("button", { name: "Submit application", exact: true })
        .click();
      await expect(
        applicant.getByRole("heading", { name: "Application submitted!" }),
      ).toBeVisible();
      await applicant
        .getByRole("dialog")
        .getByRole("link", { name: "My Applications", exact: true })
        .click();
      await expect(
        applicant.getByRole("button", { name: "Pending (1)", exact: true }),
      ).toBeVisible();
      const search = applicant.getByLabel(
        "Search applications by project or role",
      );
      await search.pressSequentially("nomatch", { delay: 50 });
      await expect(search).toHaveValue("nomatch");
      await expect(
        applicant.getByRole("heading", { name: "No matching applications" }),
      ).toBeVisible();
      await expect(
        applicant.getByRole("button", { name: "Pending (1)", exact: true }),
      ).toBeVisible();
      await search.fill("");
      await expect(
        applicant.getByText(title, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      if (action === "withdraw") {
        await applicant
          .getByRole("button", { name: "Withdraw", exact: true })
          .filter({ visible: true })
          .click();
        await expect(
          applicant.getByRole("dialog", { name: "Withdraw this application?" }),
        ).toBeVisible();
        await applicant
          .getByRole("button", { name: "Confirm withdrawal", exact: true })
          .click();
        await expect(
          applicant.getByText(
            "Application withdrawn. Reapplication to this project is unavailable.",
          ),
        ).toBeVisible();
        await applicant
          .getByRole("button", { name: "Close application details" })
          .click();
      }
      await page.goto(`/projects/${id}/manage?tab=applications`);
      if (action === "withdraw")
        await page
          .getByRole("button", { name: "Withdrawn (1)", exact: true })
          .click();
      await page
        .getByRole("button", { name: `Review ${action} Student`, exact: true })
        .click();
      const panel = page.getByRole("dialog", {
        name: `${action} Student`,
        exact: true,
      });
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (action === "withdraw") {
        await expect(
          panel.getByRole("button", { name: "Accept Teammate" }),
        ).toHaveCount(0);
      } else {
        await panel
          .getByRole("button", {
            name: action === "accept" ? "Accept Teammate" : "Reject",
            exact: true,
          })
          .click();
        const confirmation = page.getByRole("button", {
          name:
            action === "accept" ? "Confirm acceptance" : "Confirm rejection",
          exact: true,
        });
        await confirmation.focus();
        await page.keyboard.press("Enter");
        await expect(
          panel.getByText(
            `This application is ${action === "accept" ? "accepted" : "rejected"}`,
            { exact: false },
          ),
        ).toBeVisible();
      }
      await panel.evaluate((element) => {
        element.scrollTop = 0;
      });
      const bounds = await panel.boundingBox();
      expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: test.info().outputPath(`review-${action}.png`),
        fullPage: false,
      });
      await page.keyboard.press("Escape");
      await applicant.reload();
      await expect(
        applicant.getByRole("button", {
          name: `${action === "accept" ? "Accepted" : action === "reject" ? "Rejected" : "Withdrawn"} (1)`,
          exact: true,
        }),
      ).toBeVisible();
      if (action === "accept") {
        await applicant
          .getByRole("link", { name: "View Team", exact: true })
          .filter({ visible: true })
          .click();
        await expect(
          applicant.getByText("Application accepted", { exact: true }),
        ).toBeVisible();
        const detail = await applicant.request.get(
          `http://localhost:8100/api/v1/projects/${id}`,
        );
        const project = await detail.json();
        expect(project.memberCount).toBe(2);
        expect(project.roles[0].openings).toBe(1);
        await applicant.goto("/my-projects");
        await applicant
          .getByRole("button", { name: /Joined projects/ })
          .click();
        await expect(
          applicant.getByRole("heading", { name: title }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  }
  await page.goto(`/projects/${id}/manage?tab=team`);
  await expect(
    page.getByRole("heading", { name: "Team members (2 / 3)" }),
  ).toBeVisible();
  await page.goto(`/projects/${id}/manage?tab=applications`);
  await page
    .getByRole("button", { name: "Withdrawn (1)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review withdraw Student", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "withdraw Student", exact: true }),
  ).toBeVisible();
  const sibling = await page.context().newPage();
  await sibling.goto("/profile");
  await sibling.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("withdraw Student", { exact: true })).toHaveCount(
    0,
  );
  await sibling.close();
});
