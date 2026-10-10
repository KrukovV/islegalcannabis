import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("public basemap style transport", () => {
  it("retains Carto's CDN source, glyphs and sprites without a serverless asset proxy", async () => {
    const style = {
      sources: { carto: { type: "vector", url: "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json" } },
      glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
      sprite: "https://basemaps.cartocdn.com/gl/positron-gl-style/sprite",
      layers: [{ id: "water", type: "fill", paint: { "fill-color": "#ffffff" } }]
    };
    const fetchMock = vi.fn(async () => Response.json(style));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const served = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(served.sources.carto.url).toBe(style.sources.carto.url);
    expect(served.glyphs).toBe(style.glyphs);
    expect(served.sprite).toBe(style.sprite);
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-tile/");
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-glyph/");
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-sprite/");
  });
});
