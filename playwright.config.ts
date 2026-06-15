import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const existingUiLock = fs.existsSync(path.join(process.cwd(), "apps", "web", ".next", "dev", "lock"));
const shouldUseExistingUiOnly = process.env.PLAYWRIGHT_USE_EXISTING_UI_ONLY === "1" || existingUiLock;

export default defineConfig({
  testDir: "./tests",
  retries: 1,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
        }
      }
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"]
      }
    }
  ],
  webServer: shouldUseExistingUiOnly
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000
      }
});
