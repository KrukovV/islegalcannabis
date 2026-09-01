import { expect, test, type Page } from "@playwright/test";

type Scenario = {
  code: string;
  geo: string;
  camera: { lat: number; lng: number; zoom: number };
};

async function seedDocumentNavigation(page: Page, scenario: Scenario) {
  // Seed from a same-origin document which does not mount TruthMapRoot. A map
  // page would correctly consume a context only intended for its own pathname.
  await page.goto("/api/build-meta", { waitUntil: "domcontentloaded" });
  await page.evaluate((context) => {
    window.sessionStorage.setItem("truth-map-document-navigation-v1", JSON.stringify({
      targetPath: `/c/${context.code}`,
      geo: context.geo,
      camera: context.camera,
      createdAt: Date.now()
    }));
  }, scenario);
}

test("every recorded country/state class restores one bounded map context without fixed overlays", async ({ page }) => {
  test.setTimeout(100_000);
  const scenarios: Scenario[] = [
    { code: "mng", geo: "MN", camera: { lat: 46.7, lng: 107.4, zoom: 5.6 } },
    { code: "us-ks", geo: "US-KS", camera: { lat: 38.5, lng: -98, zoom: 6 } },
    { code: "us-az", geo: "US-AZ", camera: { lat: 34, lng: -111.7, zoom: 5.8 } },
    { code: "mli", geo: "ML", camera: { lat: 17, lng: -4, zoom: 4.9 } },
    { code: "dza", geo: "DZ", camera: { lat: 28, lng: 2.5, zoom: 4.9 } },
    { code: "mrt", geo: "MR", camera: { lat: 20, lng: -10, zoom: 4.8 } },
    { code: "us-la", geo: "US-LA", camera: { lat: 31, lng: -92, zoom: 6 } },
    { code: "can", geo: "CA", camera: { lat: 55, lng: -106, zoom: 4.8 } },
    { code: "ukr", geo: "UA", camera: { lat: 49, lng: 32, zoom: 5.3 } },
    { code: "us-tx", geo: "US-TX", camera: { lat: 31.2, lng: -99.7, zoom: 6.4 } },
    { code: "zaf", geo: "ZA", camera: { lat: -29.1, lng: 24.7, zoom: 4.8 } }
  ];

  for (const scenario of scenarios) {
    await seedDocumentNavigation(page, scenario);
    await page.goto(`/c/${scenario.code}#law-recreational`, { waitUntil: "domcontentloaded" });
    const mapRoot = page.getByTestId("public-map-canvas");
    const mapCanvas = page.locator("canvas.maplibregl-canvas");
    await expect(mapRoot).toHaveAttribute("data-map-ready", "1", { timeout: 30_000 });
    await expect(page.locator(`[data-seo-marker="1"][data-seo-marker-geo="${scenario.geo}"]`)).toBeVisible();
    await expect(page.locator('[data-popup-variant="truth-map"]')).toHaveCount(0);
    await expect(page.getByTestId("new-map-seo-overlay")).toHaveCount(0);
    const restored = await mapCanvas.evaluate((canvas) =>
      JSON.parse((canvas as HTMLElement).dataset.truthMapInitialCamera || "{}") as { lat: number; lng: number; zoom: number }
    );
    expect(restored.lat).toBeCloseTo(scenario.camera.lat, 3);
    expect(restored.lng).toBeCloseTo(scenario.camera.lng, 3);
    expect(restored.zoom).toBeCloseTo(scenario.camera.zoom, 3);
  }
});
