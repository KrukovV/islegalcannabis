import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TruthMapCollection } from "./truthMapSource";
import { loadPublicCountries, PUBLIC_COUNTRIES_PREFETCH_SCRIPT } from "./publicCountriesLoader";
import { STATIC_TRUTH_MAP_COUNTRIES_URL } from "./staticTruthMapUrls";

const complete = {
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [12.3456, -34.5678] }, properties: { geo: "TEST", nested: { quote: "Original citation", value: false, empty: null } } }],
  meta: { datasetHash: "retained", total: 307 },
} as unknown as TruthMapCollection;

afterEach(() => vi.unstubAllGlobals());

describe("public complete JSON delivery", () => {
  it("starts once in the home head and retains the complete response for the consumer", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(complete)));
    const context = vm.createContext({ location: { pathname: "/" }, fetch });
    vm.runInContext(PUBLIC_COUNTRIES_PREFETCH_SCRIPT, context);
    vm.runInContext(PUBLIC_COUNTRIES_PREFETCH_SCRIPT, context);
    const entry = context.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__;
    const data = await entry.promise;
    vi.stubGlobal("fetch", fetch);
    expect(await loadPublicCountries(STATIC_TRUTH_MAP_COUNTRIES_URL, entry)).toBe(data);
    expect(data).toEqual(complete);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(STATIC_TRUTH_MAP_COUNTRIES_URL, { credentials: "same-origin" });
  });

  it.each(["/c/de", "/truth-map", "/wiki-truth", "/new-map"])("does not start a public transfer on %s", (pathname) => {
    const fetch = vi.fn();
    const context = vm.createContext({ location: { pathname }, fetch });
    vm.runInContext(PUBLIC_COUNTRIES_PREFETCH_SCRIPT, context);
    expect(fetch).not.toHaveBeenCalled();
    expect(context.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__).toBeUndefined();
  });

  it("does not reuse a collection from another immutable source URL", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(complete)));
    vi.stubGlobal("fetch", fetch);
    expect(await loadPublicCountries(STATIC_TRUTH_MAP_COUNTRIES_URL, { url: "/old.json", promise: Promise.resolve({} as TruthMapCollection) })).toEqual(complete);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses one fallback after a failed head request", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(complete)));
    const context = vm.createContext({ location: { pathname: "/" }, fetch });
    vm.runInContext(PUBLIC_COUNTRIES_PREFETCH_SCRIPT, context);
    vi.stubGlobal("fetch", fetch);
    expect(await loadPublicCountries(STATIC_TRUTH_MAP_COUNTRIES_URL, context.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__)).toEqual(complete);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retains a bounded two-attempt failure without a head request", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("unavailable", { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    await expect(loadPublicCountries(STATIC_TRUTH_MAP_COUNTRIES_URL)).rejects.toThrow("truth_map_dataset_fetch:503");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
