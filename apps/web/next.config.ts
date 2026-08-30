import type { NextConfig } from "next";
import path from "node:path";

const modernNoopPolyfill = "./src/polyfills/modern-noop.ts";
const modernNoopPolyfillPath = path.resolve(__dirname, "src/polyfills/modern-noop.ts");
const countryRuntimeData = [
  "../../data/index.json",
  "../../data/countries/**/*.json",
  "../../data/graph/country-graph.json"
];
const publicMapRuntimeData = [
  ...countryRuntimeData,
  "../../data/reviews/wiki-truth-307-final-reconciliation.json",
  "../../data/reviews/truth-map-display-policy.v1.json",
  "../../data/store_truth/canonical_store_records.json",
  "../../data/store_truth/store_source_registry.json",
  "../../data/store_truth/store_eligibility_model.json"
];
const countryRuntimeRoutes = [
  "/c/*",
  "/api/nearby",
  "/api/new-map/country-page",
  "/api/sitemap",
  "/sitemap-main.xml",
  "/sitemap-countries.xml",
  "/sitemap-states.xml",
  "/sitemap-i18n.xml"
];
const publicMapRuntimeRoutes = [
  "/",
  "/api/public-map/countries",
  "/api/public-map/us-states",
  "/api/public-map/stores",
  "/api/public-map/stores/summary"
];

// Keep both bundlers on the same explicit browser-safe no-op module.
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    externalDir: true
  },
  // Country/SEO routes and the canonical public display map read bounded
  // monorepo datasets at request time. Audit, Social and DM traces stay out.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: Object.fromEntries([
    ...countryRuntimeRoutes.map((route) => [route, countryRuntimeData]),
    ...publicMapRuntimeRoutes.map((route) => [route, publicMapRuntimeData]),
  ]),
  transpilePackages: ["@islegal/shared"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "next/dist/build/polyfills/polyfill-module": modernNoopPolyfill,
      "../build/polyfills/polyfill-module": modernNoopPolyfill
    }
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "next/dist/build/polyfills/polyfill-module": modernNoopPolyfillPath,
      "../build/polyfills/polyfill-module": modernNoopPolyfillPath
    };
    return config;
  }
};

export default nextConfig;
