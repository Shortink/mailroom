import { defineConfig } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/database";

// The app is dynamic and auth-gated end to end, so these run against a real
// server and a real database rather than mocks.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3300",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev -p 3300",
    url: "http://localhost:3300/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      REQUIRE_TOTP: "false",
    },
  },
});
