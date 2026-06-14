const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = vercelBypassSecret
  ? {
      "x-vercel-protection-bypass": vercelBypassSecret,
      "x-vercel-set-bypass-cookie": "true"
    }
  : undefined;

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
    ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
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
      name: "webkit",
      use: { browserName: "webkit" }
    }
  ]
};
