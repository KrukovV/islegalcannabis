import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.PW_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3000";

type MobileProjectScope = "exclude-performance" | "performance-only";

function mobileProject(
  name: string,
  browserName: "chromium" | "webkit",
  viewport: { width: number; height: number },
  userAgent: string,
  deviceScaleFactor: number,
  scope: MobileProjectScope = "exclude-performance"
) {
  return {
    name,
    ...(scope === "performance-only"
      ? { testMatch: /mobile-performance\.spec\.ts/ }
      : { testIgnore: /mobile-performance\.spec\.ts/ }),
    use: {
      baseURL: BASE_URL,
      browserName,
      viewport,
      screen: viewport,
      isMobile: true,
      hasTouch: true,
      userAgent,
      deviceScaleFactor,
      launchOptions: browserName === "chromium"
        ? {
            args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
          }
        : undefined
    }
  };
}

export default defineConfig({
  testDir: "./tests/mobile",
  timeout: 90000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "./test-results/mobile",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../Reports/playwright-mobile.json" }]
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    mobileProject(
      "android-chrome",
      "chromium",
      { width: 360, height: 800 },
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      3
    ),
    mobileProject(
      "android-chrome-perf",
      "chromium",
      { width: 360, height: 800 },
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      3,
      "performance-only"
    ),
    mobileProject(
      "iphone-se-webkit",
      "webkit",
      { width: 375, height: 667 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      2
    ),
    mobileProject(
      "iphone-14-webkit",
      "webkit",
      { width: 390, height: 844 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      3
    ),
    mobileProject(
      "pixel-8-chrome",
      "chromium",
      { width: 412, height: 915 },
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      3
    ),
    mobileProject(
      "galaxy-fold-closed-chrome",
      "chromium",
      { width: 344, height: 882 },
      "Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      3
    ),
    mobileProject(
      "ipad-mini-webkit",
      "webkit",
      { width: 768, height: 1024 },
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      2
    ),
    mobileProject(
      "iphone-landscape-webkit",
      "webkit",
      { width: 844, height: 390 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      3
    ),
    mobileProject(
      "iphone-12-mini-webkit",
      "webkit",
      { width: 375, height: 812 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      3
    ),
    mobileProject(
      "iphone-15-pro-max-webkit",
      "webkit",
      { width: 430, height: 932 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      3
    )
  ]
});
