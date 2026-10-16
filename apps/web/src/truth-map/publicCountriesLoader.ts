import type { TruthMapCollection } from "./truthMapSource";

export type PublicCountriesPrefetch = {
  url: string;
  promise: Promise<unknown | null>;
};

// Start the one complete JSON transfer while the browser loads the map SDK.
// Other documents and the local audit route keep their existing loaders.
export const buildPublicCountriesPrefetchScript = (url: string) => `
(() => {
  if (location.pathname !== "/") return;
  const host = globalThis;
  const url = ${JSON.stringify(url)};
  if (host.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__?.url === url) return;
  host.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__ = {
    url,
    promise: fetch(url, { credentials: "same-origin" })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null)
  };
})();
`;

export async function loadPublicCountries<T = TruthMapCollection>(url: string, prefetched?: PublicCountriesPrefetch): Promise<T> {
  const request = async (): Promise<T> => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`truth_map_dataset_fetch:${response.status}`);
    return response.json() as Promise<T>;
  };
  // Preserve the existing two-attempt budget, including client navigation
  // from a document where no home-page head fetch was started.
  if (prefetched?.url === url) {
    // Share the fallback too: concurrent consumers (including a dev effect
    // remount) must not turn one failed early request into duplicate retries.
    const delivery = prefetched.promise.then((value) => value || request());
    prefetched.promise = delivery;
    return delivery as Promise<T>;
  }
  return request().catch(() => request());
}
