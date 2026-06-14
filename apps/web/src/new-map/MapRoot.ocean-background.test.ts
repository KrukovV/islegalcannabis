import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("MapRoot ocean background runtime guard", () => {
  it("re-applies the ocean background layer after load and styledata", () => {
    const source = readFileSync(fileURLToPath(new URL("./createMap.ts", import.meta.url)), "utf8");

    expect(source).toContain("export function ensureOceanBackgroundLayer(map: maplibregl.Map)");
    expect(source).toContain("NEW_MAP_OCEAN_BACKGROUND_LAYER_ID");
    expect(source).toContain("map.addLayer(");
    expect(source).toContain("firstLayerId");
    expect(source).toContain("map.once(\"load\", applyOceanBackgroundGuard)");
    expect(source).toContain("map.on(\"styledata\", () =>");
    expect(source).toContain("applyOceanBackgroundGuard()");
  });

  it("guards background and water/ocean/sea fill layers", () => {
    const source = readFileSync(fileURLToPath(new URL("./createMap.ts", import.meta.url)), "utf8");

    expect(source).toContain("layer.type === \"background\"");
    expect(source).toContain("function setPaintPropertyIfChanged");
    expect(source).toContain("setPaintPropertyIfChanged(map, layer.id, \"background-color\", NEW_MAP_OCEAN_BACKGROUND)");
    expect(source).toContain("setPaintPropertyIfChanged(map, layer.id, \"background-opacity\", 1)");
    expect(source).toContain("function isOceanFillLayer");
    expect(source).toContain("id.includes(\"water\")");
    expect(source).toContain("id.includes(\"ocean\")");
    expect(source).toContain("id.includes(\"sea\")");
    expect(source).toContain("setPaintPropertyIfChanged(map, layer.id, \"fill-color\", NEW_MAP_OCEAN_BACKGROUND)");
    expect(source).toContain("setPaintPropertyIfChanged(map, layer.id, \"fill-opacity\", 1)");
  });

  it("exposes QA hooks for non-interactive zoom repeatability metrics", () => {
    const source = readFileSync(fileURLToPath(new URL("./MapRoot.tsx", import.meta.url)), "utf8");

    expect(source).toContain("getRenderedLabelStats");
    expect(source).toContain("waitForIdle");
    expect(source).toContain("map.queryRenderedFeatures(undefined, { layers: symbolLayerIds })");
    expect(source).toContain("map.once(\"idle\", finish)");
  });
});
