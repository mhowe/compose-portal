import test, { expect } from "@playwright/test";
import { login, deleteSubmissionById, openSidebar } from "../helpers";

test.describe("Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // Ensure we're on the home page before each test
    await page.goto("/#/");
  });

  test("Add Template", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click the Add Template button
    await page.click('button:has-text("Add Template")');

    // Fill out Template and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Template Name");
    await page.getByLabel("Subject").fill("Playwright Test Template Subject");
    await page
      .getByLabel("HTML Content")
      .fill("Playwright Test Template HTML Content");
    await page
      .getByLabel("Text Content")
      .fill("Playwright Test Template Text Content");
    await page.getByRole("button", { name: "Create" }).click();

    // Verify Created Template and get submission ID
    const templateRow = page.locator("tr", {
      hasText: "_Playwright Test Template Name",
    });
    await expect(templateRow).toBeVisible();
    const submissionId = await templateRow.getAttribute("data-test-id");

    // Clean up - delete the submission
    if (submissionId) {
      await deleteSubmissionById(submissionId);
    }
  });

  test("Preview Template", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click the Add Template button
    await page.click('button:has-text("Add Template")');

    // Fill out Template and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Template Name");
    await page.getByLabel("Subject").fill(" Playwright Test Template Subject");
    await page
      .getByLabel("HTML Content")
      .fill("Playwright Test Template HTML Content");
    await page
      .getByLabel("Text Content")
      .fill("Playwright Test Template Text Content");
    await page.getByRole("button", { name: "Create" }).click();

    // Preview the created template
    const templateRow = page.locator("tr", {
      hasText: "_Playwright Test Template Name",
    });
    await expect(templateRow).toBeVisible();
    await templateRow.locator("svg.tabler-icon-eye").click();
    await page
      .locator('[data-scope="dialog"][data-part="content"][data-state="open"]')
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close" }).click();

    // Get submission ID from data-test-id attribute
    const submissionId = await templateRow.getAttribute("data-test-id");

    // Clean up - delete the submission
    if (submissionId) {
      await deleteSubmissionById(submissionId);
    }
  });

  test("Edit Template", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click the Add Template button
    await page.click('button:has-text("Add Template")');

    // Fill out Template and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Template Name");
    await page.getByLabel("Subject").fill(" Playwright Test Template Subject");
    await page
      .getByLabel("HTML Content")
      .fill("Playwright Test Template HTML Content");
    await page
      .getByLabel("Text Content")
      .fill("Playwright Test Template Text Content");
    await page.getByRole("button", { name: "Create" }).click();

    // Edit the created template
    const templateRow = page.locator("tr", {
      hasText: "_Playwright Test Template Name",
    });
    await expect(templateRow).toBeVisible();

    // Get submission ID from data-test-id attribute before editing
    const submissionId = await templateRow.getAttribute("data-test-id");

    await templateRow.locator("svg.tabler-icon-pencil").click();
    await page.locator('input[name="Name"]').clear();
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Template Name Edited");
    await page.getByRole("button", { name: "Update" }).click();

    // Verify Created Template
    await expect(
      page.locator("td", { hasText: "_Playwright Test Template Name Edited" })
    ).toHaveCount(1);

    // Clean up - delete the submission
    if (submissionId) {
      await deleteSubmissionById(submissionId);
    }
  });

  test("Delete Template", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click the Add Template button
    await page.click('button:has-text("Add Template")');

    // Fill out Template and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Template Name");
    await page.getByLabel("Subject").fill(" Playwright Test Template Subject");
    await page
      .getByLabel("HTML Content")
      .fill("Playwright Test Template HTML Content");
    await page
      .getByLabel("Text Content")
      .fill("Playwright Test Template Text Content");
    await page.getByRole("button", { name: "Create" }).click();

    // Find and delete the created template
    const templateRow = page.locator("tr", {
      hasText: "_Playwright Test Template Name",
    });
    await expect(templateRow).toBeVisible();
    await templateRow.locator("svg.tabler-icon-trash").click();
    await page.getByRole("button", { name: "Yes" }).click();

    // Verify Deletion
    await expect(
      page.locator("td", { hasText: "_Playwright Test Template Name" })
    ).toHaveCount(0);
  });

  test("Add Snippet", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click Snippets tab then Add Snippet
    await page.getByRole("button", { name: "Snippets" }).click();
    await page.getByRole("button", { name: "Add Snippet" }).click();

    // Fill out Snippet and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Snippet Name");
    await page
      .getByLabel("HTML Content")
      .fill("Playwright Test Snippet HTML Content");
    await page
      .getByLabel("Text Content")
      .fill("Playwright Test Snippet Text Content");
    await page.getByRole("button", { name: "Create" }).click();

    // Verify Created Snippet and get submission ID
    const snippetRow = page.locator("tr", {
      hasText: "_Playwright Test Snippet Name",
    });
    await expect(snippetRow).toBeVisible();
    const submissionId = await snippetRow.getAttribute("data-test-id");

    // Clean up - delete the submission
    if (submissionId) {
      await deleteSubmissionById(submissionId);
    }
  });

  test("Add Date Format", async ({ page }) => {
    await openSidebar(page);

    // Click Settings in the sidebar
    await page.getByRole("link", { name: "Settings" }).click();

    // Locate and click the notifications tab
    await page.click('a:has-text("notifications")');

    // Click Date Formats tab then Add Date Format
    await page.getByRole("button", { name: "Date Formats" }).click();
    await page.getByRole("button", { name: "Add Date Format" }).click();

    // Fill out Date Format and Create
    await page.locator('input[name="Name"]').waitFor({ state: "visible" });
    await page
      .locator('input[name="Name"]')
      .fill("_Playwright Test Date Format Name");
    await page.locator('input[name="Format"]').fill("%m-%e-%y %H:%M");
    await page.getByRole("button", { name: "Create" }).click();

    // Verify Created Date Format and get submission ID
    const dateFormatRow = page.locator("tr", {
      hasText: "_Playwright Test Date Format Name",
    });
    await expect(dateFormatRow).toBeVisible();
    const submissionId = await dateFormatRow.getAttribute("data-test-id");

    // Clean up - delete the submission
    if (submissionId) {
      await deleteSubmissionById(submissionId);
    }
  });
});
