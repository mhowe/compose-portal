import test, { expect } from "@playwright/test";
import { login, openSidebar } from "../helpers";

test.describe("Sidebar Menu", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // Ensure we're on the home page before each test
    await page.goto('/#/');
  });

  test("Go To Submit a Request", async ({ page }) => {
    await openSidebar(page);

    // Click Submit a Request in the sidebar
    await page
      .locator('[data-scope="popover"][data-part="content"]')
      .locator('button:has-text("Submit a Request")')
      .click();

    // Verify the Submit Request dialog opened
    await expect(
      page.locator('[data-scope="dialog"][data-part="content"]')
    ).toBeVisible();
  });

  test("Go To Check Status", async ({ page }) => {
    await openSidebar(page);

    // Click Check Status in the sidebar
    await page
      .locator('[data-scope="popover"][data-part="content"]')
      .locator('a:has-text("Check Status")')
      .click();

    // Verify that it navigated to the Check Status page
    await expect(
      page.locator("span.text-lg.md\\:text-xl.font-semibold")
    ).toContainText("Check Status");
  });

  test("Go To My Work", async ({ page }) => {
    await openSidebar(page);

    // Click My Work in the sidebar
    await page
      .locator('[data-scope="popover"][data-part="content"]')
      .locator('a:has-text("My Work")')
      .click();

    // Verify that it navigated to the My Work page
    await expect(
      page.locator("span.text-lg.md\\:text-xl.font-semibold")
    ).toContainText("My Work");
  });
});
