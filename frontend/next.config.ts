import type { NextConfig } from "next";
import { proxyConfig } from "./src/lib/api-proxy";
if (
  process.env.VERCEL === "1" &&
  process.env.NEXT_PUBLIC_APP_MODE === "api" &&
  process.env.NEXT_PUBLIC_API_BASE_URL !== "/api/v1"
) {
  throw new Error("Hosted API mode requires NEXT_PUBLIC_API_BASE_URL=/api/v1");
}
if (process.env.VERCEL === "1" && process.env.NEXT_PUBLIC_APP_MODE === "api") {
  proxyConfig(process.env);
}
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return ["/reset-password", "/verify-email"].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
      ],
    }));
  },
};
export default config;
