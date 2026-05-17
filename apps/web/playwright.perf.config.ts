import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.PW_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3000";

function perfProject(options: {
  name: string;
  browserName: "chromium" | "webkit";
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}) {
  const isChromium = options.browserName === "chromium";
  return {
    name: options.name,
    use: {
      baseURL: BASE_URL,
      browserName: options.browserName,
      viewport: options.viewport,
      screen: options.viewport,
      isMobile: Boolean(options.isMobile),
      hasTouch: Boolean(options.hasTouch),
      userAgent: options.userAgent,
      deviceScaleFactor: options.deviceScaleFactor,
      launchOptions: isChromium
        ? {
            args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"]
          }
        : undefined
    }
  };
}

export default defineConfig({
  testDir: "./tests/perf",
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "./test-results/perf",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../Reports/playwright-perf.json" }]
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on",
    screenshot: "off",
    video: "off"
  },
  projects: [
    perfProject({
      name: "desktop-chrome",
      browserName: "chromium",
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      deviceScaleFactor: 2
    }),
    perfProject({
      name: "desktop-safari-webkit",
      browserName: "webkit",
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      deviceScaleFactor: 2
    }),
    perfProject({
      name: "iphone-se-webkit",
      browserName: "webkit",
      viewport: { width: 375, height: 667 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    }),
    perfProject({
      name: "iphone-15-pro-max-webkit",
      browserName: "webkit",
      viewport: { width: 430, height: 932 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }),
    perfProject({
      name: "pixel-8-chrome",
      browserName: "chromium",
      viewport: { width: 412, height: 915 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }),
    perfProject({
      name: "galaxy-fold-closed-chrome",
      browserName: "chromium",
      viewport: { width: 344, height: 882 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }),
    perfProject({
      name: "ipad-mini-webkit",
      browserName: "webkit",
      viewport: { width: 768, height: 1024 },
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    })
  ]
});
