import { expect, type Page } from "@playwright/test";

export async function completeSignup(page: Page, email: string) {
  await expect(
    page.getByRole("heading", { name: "Enter your verification code" }),
  ).toBeVisible();
  let code = "";
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const data = (await search.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        const item = data.messages.find(
          (m) => m.Subject === "Your CampusCollab signup code",
        );
        if (!item) return false;
        const response = await fetch(
          `http://localhost:8025/api/v1/message/${item.ID}`,
        );
        const message = (await response.json()) as { Text: string };
        code = message.Text.match(/Code: ([0-9]{6})/)?.[1] ?? "";
        return code.length === 6;
      },
      { message: "Expected signup email in local Mailpit", timeout: 15000 },
    )
    .toBe(true);
  // No assertions containing the code, no traces/screenshots or email attachments.
  await page.getByLabel("Verification code", { exact: true }).fill(code);
  await page.getByLabel("Verification code", { exact: true }).press("Enter");
  code = "";
}

// API suite disables traces/screenshots/video. Never attach messages or token URLs.
export async function mailLink(email: string, purpose: "verify" | "reset") {
  let link = "";
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const data = (await search.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        const item = data.messages.find((m) =>
          m.Subject.startsWith(purpose === "verify" ? "Verify" : "Reset"),
        );
        if (!item) return false;
        const response = await fetch(
          `http://localhost:8025/api/v1/message/${item.ID}`,
        );
        const message = (await response.json()) as { Text: string };
        link =
          message.Text.match(
            /http:\/\/localhost:3100\/(?:verify-email|reset-password)#token=[A-Za-z0-9_-]{43}/,
          )?.[0] ?? "";
        return Boolean(link);
      },
      { message: "Expected a local authentication email", timeout: 15000 },
    )
    .toBe(true);
  return link;
}

export async function openMailLink(page: Page, link: string) {
  // No token-bearing navigation step in the reporter; only the browser receives it.
  await page.evaluate((target) => {
    window.location.assign(target);
  }, link);
  await expect
    .poll(
      () => {
        const current = new URL(page.url());
        return (
          current.hash === "" &&
          ["/verify-email", "/reset-password"].includes(current.pathname)
        );
      },
      { message: "Token page removes its fragment" },
    )
    .toBe(true);
}

export async function verifyEmail(page: Page, email: string) {
  await openMailLink(page, await mailLink(email, "verify"));
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByRole("link", { name: "Open profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true }),
  ).toHaveCount(0);
}
