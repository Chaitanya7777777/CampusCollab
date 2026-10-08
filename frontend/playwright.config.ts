import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.MOCK_TEST_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "tablet",
      testMatch: /milestone.spec.ts/,
      grep: /layouts fit/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 820, height: 1180 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: {
    env: {
      NEXT_PUBLIC_APP_MODE: "mock",
      NEXT_DIST_DIR: process.env.MOCK_TEST_DIST_DIR ?? ".next",
    },
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
