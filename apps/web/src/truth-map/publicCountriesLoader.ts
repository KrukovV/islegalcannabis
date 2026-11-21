import type { TruthMapCollection } from "./truthMapSource";
import { STATIC_TRUTH_MAP_COUNTRIES_URL } from "./staticTruthMapUrls";

export type PublicCountriesPrefetch = {
  url: string;
  promise: Promise<TruthMapCollection | null>;
};

// The homepage and article maps share the same immutable transfer.
const PREFETCH_COUNTRIES = `
  const host = globalThis;
  const url = ${JSON.stringify(STATIC_TRUTH_MAP_COUNTRIES_URL)};
  if (host.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__?.url === url) return;
  host.__PUBLIC_TRUTH_MAP_COUNTRIES_PREFETCH__ = {
    url,
    promise: fetch(url, { credentials: "same-origin", priority: "low" })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null)
  };`;

export const PUBLIC_COUNTRIES_PREFETCH_SCRIPT = `
(() => {
  if (location.pathname !== "/") return;
${PREFETCH_COUNTRIES}})();
`;

export const PUBLIC_ARTICLE_COUNTRIES_PREFETCH_SCRIPT = `(() => {${PREFETCH_COUNTRIES}})();`;

export async function loadPublicCountries(url: string, prefetched?: PublicCountriesPrefetch) {
  const request = async (): Promise<TruthMapCollection> => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`truth_map_dataset_fetch:${response.status}`);
    return response.json() as Promise<TruthMapCollection>;
  };
  // Preserve the existing two-attempt budget, including client navigation
  // from a document where no home-page head fetch was started.
  const first = prefetched?.url === url ? prefetched.promise : request().catch(() => null);
  return await first || request();
}
