import { test, expect } from "@playwright/test";
test("mock catalog creation survives discard and reload without submitting the form", async ({
  page,
}) => {
  await page.goto("/profile");
  const original = await page.getByLabel("Full name").inputValue();
  await page.getByLabel("Full name").fill("Unsaved Student");
  const search = page.getByLabel("Search skill catalog", { exact: true });
  await search.fill("Local Collaborative Design");
  await search.press("Enter");
  await expect(page.getByLabel("Full name")).toHaveValue("Unsaved Student");
  await page
    .getByRole("button", {
      name: "Add \u201cLocal Collaborative Design\u201d",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Local Collaborative Design",
      exact: true,
    }),
  ).toBeVisible();
  await expect(search).toBeFocused();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByLabel("Full name")).toHaveValue(original);
  await expect(
    page.getByRole("button", {
      name: "Remove Local Collaborative Design",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByLabel("Search skill catalog", { exact: true })
    .fill("local collaborative design");
  await page
    .getByRole("button", {
      name: "Add Local Collaborative Design",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText(
      "Profile saved. Your changes are now available across CampusCollab.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove Local Collaborative Design",
      exact: true,
    }),
  ).toBeVisible();
});
