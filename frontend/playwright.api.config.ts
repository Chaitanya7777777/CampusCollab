import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
process.env.CONVERSION_TEST_EMAIL ??= `operator-${randomUUID()}@example.com`;
process.env.CONVERSION_TEST_PASSWORD ??= `test-only-${randomUUID()}`;
export default defineConfig({
  testDir: "./e2e-api",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: { baseURL: "http://localhost:3100", trace: "off", screenshot: "off" },
  projects: [
    {
      name: "api-desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "api-mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: [
    {
      command:
        process.platform === "win32"
          ? "..\\backend\\.venv\\Scripts\\python.exe -m tests.browser_server"
          : "../backend/.venv/bin/python -m tests.browser_server",
      cwd: "../backend",
      url: "http://localhost:8100/health/ready",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "npm run dev -- --hostname localhost --port 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_APP_MODE: "api",
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:8100/api/v1",
        NEXT_DIST_DIR: ".next-api",
      },
    },
  ],
});
