import { Page } from "@playwright/test";
import axios from "axios";
import { TEST_HOST, USERNAME, PASSWORD, TEST_DOMAIN } from "./constants";


export async function login(page: Page) {
  await page.goto(`${TEST_HOST}/#/`);
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  
  // Wait for successful login by verifying URL stays on home page
  await page.waitForURL(`${TEST_HOST}/#/`);
}

// Function to open the sidebar menu
export async function openSidebar(page: Page) {
  // Open the navigation menu
  await page.locator("button:has(svg.tabler-icon-menu-2)").click();
  await page
    .locator('[data-scope="popover"][data-part="content"]')
    .waitFor({ state: "visible" });
}

// Clean up function to delete a submission by ID
export async function deleteSubmissionById(submissionId: string) {
  try {
    await axios.delete(`${TEST_DOMAIN}/app/api/v1/submissions/${submissionId}`, {
      headers: {
        "Content-Type": "application/json",
      },
      auth: {
        username: USERNAME,
        password: PASSWORD,
      },
    });
    console.log(`Successfully deleted submission: ${submissionId}`);
  } catch (error: any) {
    console.error(`Failed to delete submission ${submissionId}:`, error.message);
    throw error;
  }
}
