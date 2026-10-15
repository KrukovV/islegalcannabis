const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const browserName = process.env.PLAYWRIGHT_BROWSER_NAME || "webkit";

export default {
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../../Reports/playwright-smoke.json" }]
  ],
  use: {
    baseURL,
    headless: true,
    // Preserve failed live-provider request timings without screenshots or DOM
    // snapshots. Assertions, deadlines and retry count remain unchanged.
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: false, sources: false },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--enable-unsafe-swiftshader"
      ]
    }
  },
  projects: [
    {
      name: browserName,
      use: { browserName }
    }
  ]
};
