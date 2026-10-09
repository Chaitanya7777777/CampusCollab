import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import base from "./playwright.api.config";
const secret = randomBytes(32).toString("hex");
process.env.BROWSER_PROXY_SECRET = secret;
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  ...base,
  testDir: "./e2e-proxy",
  outputDir: "test-results/proxy",
  webServer: [
    { ...servers[0] },
    {
      ...servers[1],
      env: {
        NEXT_PUBLIC_APP_MODE: "api",
        NEXT_PUBLIC_API_BASE_URL: "/api/v1",
        NEXT_DIST_DIR: ".next-proxy",
        APP_ORIGIN: "http://localhost:3100",
        API_BACKEND_ORIGIN: "http://localhost:8100",
        API_PROXY_SECRET: secret,
        API_PROXY_LOCAL: "true",
      },
    },
  ],
});
