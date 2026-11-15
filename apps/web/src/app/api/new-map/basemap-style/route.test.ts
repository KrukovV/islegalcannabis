import { afterEach, describe, expect, it, vi } from "vitest";
import { STATIC_BASEMAP_STYLE } from "@/new-map/staticBasemapStyle";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("public basemap style transport", () => {
  it("retains the accepted93-layer style and direct provider assets without a serverless asset proxy", async () => {
    // The formerly used CARTO URL now serves a different vector schema. Its
    // contents must not enter a runtime that requires the accepted carto source.
    const fetchMock = vi.fn(async () => Response.json({ sources: { protomaps: {} }, layers: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    const served = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(served).toEqual(JSON.parse(JSON.stringify(STATIC_BASEMAP_STYLE)));
    expect(served.layers).toHaveLength(93);
    expect(served.sources.carto.type).toBe("vector");
    expect(served.sources.carto.url).toBe("https://tiles.openfreemap.org/planet");
    expect(served.glyphs).toBe(STATIC_BASEMAP_STYLE.glyphs);
    expect(served.sprite).toEqual(STATIC_BASEMAP_STYLE.sprite);
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-tile/");
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-glyph/");
    expect(JSON.stringify(served)).not.toContain("/api/new-map/basemap-sprite/");
  });
});
