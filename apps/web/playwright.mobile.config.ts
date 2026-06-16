import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.PW_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3000";

function mobileProject(options: {
  name: string;
  browserName: "chromium" | "webkit";
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
}) {
  const isChromium = options.browserName === "chromium";
  return {
    name: options.name,
    use: {
      baseURL: BASE_URL,
      browserName: options.browserName,
      viewport: options.viewport,
      screen: options.viewport,
      isMobile: true,
      hasTouch: true,
      userAgent: options.userAgent,
      deviceScaleFactor: options.deviceScaleFactor,
      launchOptions: isChromium
        ? {
            args: [
              "--use-angle=swiftshader",
              "--use-gl=angle",
              "--enable-unsafe-swiftshader"
            ]
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
    mobileProject({
      name: "android-chrome",
      browserName: "chromium",
      viewport: { width: 360, height: 800 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "iphone-se-webkit",
      browserName: "webkit",
      viewport: { width: 375, height: 667 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2
    }),
    mobileProject({
      name: "iphone-14-webkit",
      browserName: "webkit",
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "pixel-8-chrome",
      browserName: "chromium",
      viewport: { width: 412, height: 915 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "galaxy-fold-closed-chrome",
      browserName: "chromium",
      viewport: { width: 344, height: 882 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "ipad-mini-webkit",
      browserName: "webkit",
      viewport: { width: 768, height: 1024 },
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2
    }),
    mobileProject({
      name: "ipad-pro-chrome",
      browserName: "chromium",
      viewport: { width: 1024, height: 1366 },
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/136.0.0.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2
    }),
    mobileProject({
      name: "iphone-landscape-webkit",
      browserName: "webkit",
      viewport: { width: 844, height: 390 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "iphone-12-mini-webkit",
      browserName: "webkit",
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3
    }),
    mobileProject({
      name: "iphone-15-pro-max-webkit",
      browserName: "webkit",
      viewport: { width: 430, height: 932 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3
    })
  ]
});
