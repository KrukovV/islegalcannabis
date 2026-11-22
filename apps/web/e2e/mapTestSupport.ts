import type { Page } from "@playwright/test";
import type { Map } from "maplibre-gl";

export type MapTestWindow = Window & { __MAP_TEST_INSTANCE__?: Map };

export async function captureMapInstance(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "cancelPendingTileRequestsWhileZooming", {
      configurable: true,
      set(value: boolean) {
        Object.defineProperty(this, "cancelPendingTileRequestsWhileZooming", { value, writable: true, configurable: true });
        if (typeof this.project === "function" && typeof this.getCanvas === "function") {
          (window as MapTestWindow).__MAP_TEST_INSTANCE__ = this;
        }
      }
    });
  });
}
