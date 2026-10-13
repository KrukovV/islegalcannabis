export const PUBLIC_TRUTH_MAP_BOOTSTRAP_ID = "public-map-countries";

// A native script request overlaps CSS; a fetch inside an inline script waits
// for preceding stylesheets in WebKit. Preserve the complete JSON collection.
export function buildTruthMapBootstrap(json: string) {
  return `globalThis.__PUBLIC_TRUTH_MAP_COUNTRIES__=JSON.parse(${JSON.stringify(json)});globalThis.__PUBLIC_TRUTH_MAP_COUNTRIES_RESOLVE__?.(globalThis.__PUBLIC_TRUTH_MAP_COUNTRIES__);\n`;
}
