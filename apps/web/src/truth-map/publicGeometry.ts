import maplibregl from "maplibre-gl";
import { decode } from "geobuf";
import Pbf from "pbf";
import { STATIC_TRUTH_MAP_COUNTRIES_URL, STATIC_TRUTH_MAP_COUNTRIES_GEOBUF_URL } from "./staticTruthMapUrls";

type GeometryRequest = {
  url: string;
  controller: AbortController;
  promise: Promise<ArrayBuffer>;
};
type GeometryHost = typeof globalThis & { __PUBLIC_MAP_GEOMETRY_REQUEST__?: GeometryRequest };

// The HTML begins one full request; the SDK takes ownership instead of fetching
// it again. Once consumed, this is ordinary abortable source loading, not a cache.
async function loadGeometry(parameters: { url: string }, abortController: AbortController) {
  abortController.signal.throwIfAborted();
  const url = parameters.url.replace(/^islegal-geobuf:/, location.protocol);
  if (url !== new URL(STATIC_TRUTH_MAP_COUNTRIES_GEOBUF_URL, location.href).href) {
    throw new Error("PUBLIC_MAP_GEOMETRY_URL_INVALID");
  }
  const host = globalThis as GeometryHost;
  const prepared = host.__PUBLIC_MAP_GEOMETRY_REQUEST__;
  let request: GeometryRequest;
  if (prepared?.url === url) {
    delete host.__PUBLIC_MAP_GEOMETRY_REQUEST__;
    request = prepared;
  } else {
    const controller = new AbortController();
    const promise = fetch(url, { signal: controller.signal, credentials: "same-origin" }).then((response) => {
      if (!response.ok) throw new Error(`public_map_geometry:${response.status}`);
      return response.arrayBuffer();
    });
    request = { url, controller, promise };
  }
  const cancel = () => request.controller.abort();
  abortController.signal.addEventListener("abort", cancel, { once: true });
  try {
    const bytes = await request.promise;
    abortController.signal.throwIfAborted();
    return { data: decode(new Pbf(new Uint8Array(bytes))) };
  } finally {
    abortController.signal.removeEventListener("abort", cancel);
  }
}

export function resolvePublicCountriesSourceUrl(url: string) {
  if (url !== STATIC_TRUTH_MAP_COUNTRIES_URL) return url;
  maplibregl.addProtocol("islegal-geobuf", loadGeometry);
  return new URL(STATIC_TRUTH_MAP_COUNTRIES_GEOBUF_URL, location.href).href.replace(/^https?:/, "islegal-geobuf:");
}
