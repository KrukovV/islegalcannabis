import { afterEach, describe, expect, it, vi } from "vitest";
import maplibregl from "maplibre-gl";
import { encode } from "geobuf";
import Pbf from "pbf";
import { resolvePublicCountriesSourceUrl } from "./publicGeometry";
import { STATIC_TRUTH_MAP_COUNTRIES_URL, STATIC_TRUTH_MAP_COUNTRIES_GEOBUF_URL } from "./staticTruthMapUrls";

vi.mock("maplibre-gl", () => ({ default: { addProtocol: vi.fn() } }));
const data = { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [1.2345, 2] }, properties: { geo: "XY", result: { active: true, evidence: [1, "a"] } } }] };
const binary = new Uint8Array(encode(data, new Pbf())).buffer;
const host = globalThis as typeof globalThis & { __PUBLIC_MAP_GEOMETRY_REQUEST__?: { url: string; controller: AbortController; promise: Promise<ArrayBuffer> } };
function setup() {
  vi.stubGlobal("location", new URL("https://www.islegal.info/"));
  const url = resolvePublicCountriesSourceUrl(STATIC_TRUTH_MAP_COUNTRIES_URL);
  const handler = vi.mocked(maplibregl.addProtocol).mock.calls.at(-1)![1];
  return { url, handler, httpUrl: new URL(STATIC_TRUTH_MAP_COUNTRIES_GEOBUF_URL, location.href).href };
}
afterEach(() => { delete host.__PUBLIC_MAP_GEOMETRY_REQUEST__; vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("complete public geometry transport", () => {
  it("consumes the early request exactly once and preserves typed data", async () => {
    const { url, handler, httpUrl } = setup();
    const fetcher = vi.fn(async () => new Response(new Blob([binary])));
    vi.stubGlobal("fetch", fetcher);
    host.__PUBLIC_MAP_GEOMETRY_REQUEST__ = { url: httpUrl, controller: new AbortController(), promise: Promise.resolve(binary) };
    expect((await handler({ url }, new AbortController())).data).toEqual(data);
    expect(host.__PUBLIC_MAP_GEOMETRY_REQUEST__).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handler({ url }, new AbortController())).data).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("propagates early failure so the SDK owns the single retry", async () => {
    const { url, handler, httpUrl } = setup();
    const promise = Promise.reject(new Error("public_map_geometry:503"));
    promise.catch(() => {});
    host.__PUBLIC_MAP_GEOMETRY_REQUEST__ = { url: httpUrl, controller: new AbortController(), promise };
    const fetcher = vi.fn(async () => new Response(new Blob([binary])));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler({ url }, new AbortController())).rejects.toThrow("503");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handler({ url }, new AbortController())).data).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts the owned in-flight HTTP request when the SDK cancels", async () => {
    const { url, handler, httpUrl } = setup();
    const controller = new AbortController();
    const promise = new Promise<ArrayBuffer>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    host.__PUBLIC_MAP_GEOMETRY_REQUEST__ = { url: httpUrl, controller, promise };
    const sdk = new AbortController();
    const result = handler({ url }, sdk);
    const rejection = expect(result).rejects.toThrow("Aborted");
    sdk.abort();
    await rejection;
    expect(controller.signal.aborted).toBe(true);
  });
  it("does not rewrite audit or arbitrary source URLs and rejects foreign protocol data", async () => {
    const { handler } = setup();
    expect(resolvePublicCountriesSourceUrl("/audit.json")).toBe("/audit.json");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(handler({ url: "islegal-geobuf://foreign.invalid/geo" }, new AbortController())).rejects.toThrow("URL_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
