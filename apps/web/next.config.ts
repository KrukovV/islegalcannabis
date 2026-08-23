import type { NextConfig } from "next";
import path from "node:path";

const modernNoopPolyfill = "./src/polyfills/modern-noop.ts";
const modernNoopPolyfillPath = path.resolve(__dirname, "src/polyfills/modern-noop.ts");
const countryRuntimeData = [
  "../../data/index.json",
  "../../data/countries/**/*.json",
  "../../data/graph/country-graph.json"
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

// Keep both bundlers on the same explicit browser-safe no-op module.
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    externalDir: true
  },
  // Country pages, their existing APIs, and split sitemap handlers read the
  // monorepo data tree at request time. Scope the inputs to only those routes;
  // audit, Truth Map, Social, Store, and unrelated traces stay untouched.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: Object.fromEntries(
    countryRuntimeRoutes.map((route) => [route, countryRuntimeData])
  ),
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
