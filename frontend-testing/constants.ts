// Base configuration
export const TEST_DOMAIN =
  process.env.PW_BASE_URI || "http://localhost:3000";
export const SPACE_URI = process.env.PW_SPACE_URI || "https://momentum-dev.kinopsdev.io";
export const TEST_HOST = TEST_DOMAIN;

// Authentication
export const USERNAME = process.env.PW_USERNAME || "";
export const PASSWORD = process.env.PW_PASSWORD || "";
