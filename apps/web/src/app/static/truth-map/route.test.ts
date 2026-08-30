import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  getStaticTruthMapAsset,
  STATIC_TRUTH_MAP_COUNTRIES_HASH,
  STATIC_TRUTH_MAP_US_STATES_HASH
} from "@/truth-map/staticTruthMap";
import {
  dynamic,
  dynamicParams,
  generateStaticParams,
  GET,
  revalidate
} from "./[file]/route";

describe("static Truth Map route", () => {
  it("pre-renders immutable content-addressed assets without changing their bytes", async () => {
    expect(dynamic).toBe("force-static");
    expect(dynamicParams).toBe(true);
    expect(revalidate).toBe(false);
    expect(generateStaticParams()).toEqual([
      { file: `countries.${STATIC_TRUTH_MAP_COUNTRIES_HASH}.json.br` },
      { file: `us-states.${STATIC_TRUTH_MAP_US_STATES_HASH}.json.br` }
    ]);

    for (const layer of ["countries", "us-states"] as const) {
      const asset = getStaticTruthMapAsset(layer);
      const file = asset.url.split("/").at(-1)!;
      const response = await GET(new Request(`https://www.islegal.info${asset.url}`), {
        params: Promise.resolve({ file })
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(response.headers.get("content-encoding")).toBe("br");
      expect(response.headers.get("x-truth-map-hash")).toBe(asset.hash);
      const compressed = Buffer.from(await response.arrayBuffer());
      expect(brotliDecompressSync(compressed).toString("utf8")).toBe(asset.json);
    }
  });
});
