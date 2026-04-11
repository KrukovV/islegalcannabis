import { expect, test } from "playwright/test";

test("new-map restored gps marker survives reload", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("geo", JSON.stringify({
      lat: 50.0755,
      lng: 14.4378,
      source: "gps",
      iso2: "CZ"
    }));
  });

  await page.goto("/new-map", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 5000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-user-marker="1"]')?.getAttribute("data-user-marker-position") === "14.4378,50.0755", { timeout: 5000 });

  const markerPosition = await page.locator('[data-user-marker="1"]').getAttribute("data-user-marker-position");
  expect(markerPosition).toBe("14.4378,50.0755");
});
