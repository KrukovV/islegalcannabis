const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default {
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL,
    headless: true
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
    }
  ]
};
