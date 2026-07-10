import { describe, expect, it } from "vitest";
import { brotliDecompressSync } from "node:zlib";
import { getStaticCountriesAsset, STATIC_COUNTRIES_HASH } from "@/new-map/staticCountries";
import {
  dynamic,
  dynamicParams,
  generateStaticParams,
  GET,
  revalidate
} from "./[file]/route";

describe("static countries route", () => {
  it("pre-renders the content-addressed payload without changing its bytes", async () => {
    const asset = getStaticCountriesAsset();

    expect(dynamic).toBe("force-static");
    expect(dynamicParams).toBe(false);
    expect(revalidate).toBe(false);
    expect(generateStaticParams()).toEqual([
      { file: `countries.${STATIC_COUNTRIES_HASH}.json.br` }
    ]);

    const response = await GET(
      new Request(`https://www.islegal.info${asset.url}`),
      { params: Promise.resolve({ file: `countries.${asset.hash}.json.br` }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("content-encoding")).toBe("br");
    const compressed = Buffer.from(await response.arrayBuffer());
    expect(brotliDecompressSync(compressed).toString("utf8")).toBe(asset.json);
  });
});
