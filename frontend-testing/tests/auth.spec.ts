import { test, expect } from "@playwright/test";
import { TEST_HOST, USERNAME, PASSWORD } from "../constants";

test("authenticate", async ({ page }) => {
  // Login
  await page.goto(`${TEST_HOST}/#/`);
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for successful login
  await expect(page).toHaveURL(`${TEST_HOST}/#/`);
});
